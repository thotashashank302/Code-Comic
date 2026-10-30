import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleAnalysis, getSampleExplanation } from '@comic-code/comic/sample'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  owned: vi.fn(),
  access: vi.fn(),
  installation: vi.fn(),
  artwork: vi.fn(),
  compose: vi.fn(),
  upload: vi.fn(),
  complete: vi.fn(),
  remove: vi.fn(),
  fail: vi.fn(),
  audit: vi.fn(),
}))
vi.mock('@comic-code/comic', () => ({
  generateByokPanelArtwork: mocks.artwork,
  composeComic: mocks.compose,
}))
vi.mock('@comic-code/database', () => ({
  getOwnedExplanation: mocks.owned,
  completeExplanation: mocks.complete,
  failExplanation: mocks.fail,
  recordAuditEvent: mocks.audit,
  removeArtifacts: mocks.remove,
  uploadComicArtifact: mocks.upload,
}))
vi.mock('@/lib/auth/session', () => ({
  requireRequestSession: mocks.session,
  UnauthorizedError: class extends Error {},
}))
vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({ NEXT_PUBLIC_APP_URL: 'https://example.com' }),
}))
vi.mock('@/lib/server', () => ({
  databaseClient: () => ({}),
  githubClient: () => ({
    assertUserCanReadRepository: mocks.access,
    getInstallationId: mocks.installation,
  }),
  publicExplanation: async (row: unknown) => row,
}))

import { HttpError } from '@/lib/http'
import { POST } from './route'

const secret = 'dummy-provider-image-key-never-store'
const row = {
  id: 'comic',
  status: 'completed',
  analysis: sampleAnalysis,
  final_artifact_path: 'old.png',
  selected_files: ['src/form.ts'],
  github_owner: 'owner',
  github_repository: 'repo',
}
const context = { params: Promise.resolve({ id: 'comic' }) }
const request = (provider = 'openai') =>
  new Request('https://example.com/api/v1/explanations/comic/artwork', {
    method: 'POST',
    headers: {
      origin: 'https://example.com',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ provider, apiKey: secret }),
  })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue({
    userId: 'user',
    accessToken: 'github-session',
  })
  mocks.owned.mockResolvedValue(row)
  mocks.access.mockResolvedValue({ isPrivate: false })
  mocks.artwork.mockResolvedValue([])
  mocks.compose.mockResolvedValue(Buffer.from('composed PNG'))
  mocks.upload.mockResolvedValue('new.png')
  mocks.complete.mockResolvedValue(undefined)
  mocks.remove.mockResolvedValue(undefined)
  mocks.fail.mockResolvedValue(undefined)
  mocks.audit.mockResolvedValue(undefined)
})

describe('hosted image BYOK boundary', () => {
  it('requires a session before loading a comic or calling an image provider', async () => {
    mocks.session.mockRejectedValue(
      new HttpError(401, 'authentication_required'),
    )
    expect((await POST(request(), context)).status).toBe(401)
    expect(mocks.owned).not.toHaveBeenCalled()
    expect(mocks.artwork).not.toHaveBeenCalled()
  })
  it.each(['openai', 'gemini'])(
    'updates artwork with %s while retaining captions, evidence and selected files',
    async (provider) => {
      const response = await POST(request(provider), context)
      expect(response.status).toBe(200)
      expect(mocks.access).toHaveBeenCalledWith(
        'github-session',
        'owner',
        'repo',
      )
      expect(mocks.artwork).toHaveBeenCalledWith(
        expect.objectContaining({ provider, apiKey: secret }),
        expect.objectContaining({
          ...sampleAnalysis,
          artworkProvider: `${provider}_byok`,
        }),
      )
      expect(mocks.complete).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          selectedFiles: row.selected_files,
          artifactPath: 'new.png',
        }),
      )
      expect(mocks.remove).toHaveBeenCalledWith(expect.anything(), ['old.png'])
      expect(JSON.stringify(mocks.complete.mock.calls)).not.toContain(secret)
      expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(secret)
    },
  )

  it('records the actual twelve-panel image count', async () => {
    mocks.owned.mockResolvedValue({
      ...row,
      analysis: getSampleExplanation(12).analysis,
    })
    expect((await POST(request(), context)).status).toBe(200)
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({ imageCount: 12 }),
      }),
    )
  })

  it('cleans rejected concurrent artwork without replacing the current comic', async () => {
    mocks.complete.mockRejectedValue(
      Object.assign(new Error('artwork_conflict'), {
        code: 'artwork_conflict',
      }),
    )
    expect((await POST(request(), context)).status).toBe(409)
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(expect.anything(), [
      'new.png',
    ])
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  it('checks ownership and current private-repository access before any provider call', async () => {
    mocks.access.mockRejectedValue({ status: 403 })
    expect((await POST(request(), context)).status).toBe(403)
    expect(mocks.owned).toHaveBeenCalledWith(expect.anything(), 'comic', 'user')
    expect(mocks.artwork).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('preserves an existing comic on provider failure without returning or logging an upstream key', async () => {
    const errors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.artwork.mockRejectedValue({
      code: 'image_provider_quota_reached',
      details: { responseBody: secret },
    })
    const response = await POST(request(), context)
    expect(response.status).toBe(429)
    expect(await response.text()).not.toContain(secret)
    expect(JSON.stringify(errors.mock.calls)).not.toContain(secret)
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.fail).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('cleans a newly uploaded artifact if saving fails, keeping the old artifact', async () => {
    const errors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.complete.mockRejectedValue(new Error('database unavailable'))
    expect((await POST(request(), context)).status).toBe(500)
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(expect.anything(), [
      'new.png',
    ])
    expect(mocks.fail).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('rejects obsolete provider credentials before generating images', async () => {
    expect((await POST(request('cloudflare'), context)).status).toBe(400)
    expect(mocks.artwork).not.toHaveBeenCalled()
  })
})
