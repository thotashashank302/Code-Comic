import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  github: {
    assertUserCanReadRepository: vi.fn(),
    getRepositorySnapshot: vi.fn(),
  },
  prepareRepository: vi.fn(),
  createExplanation: vi.fn(),
  getExisting: vi.fn(),
  countRecent: vi.fn(),
  saveScan: vi.fn(),
  saveAnalysis: vi.fn(),
  fail: vi.fn(),
  setRun: vi.fn(),
  trigger: vi.fn(),
  idempotency: vi.fn(),
}))

vi.mock('@trigger.dev/sdk', () => ({
  idempotencyKeys: { create: vi.fn(async (key) => key) },
  tasks: { trigger: mocks.trigger },
}))
vi.mock('@comic-code/comic', () => ({
  createDeterministicComicAnalysis: () => ({ claims: [] }),
  createSafetyIdentifier: () => 'safe',
}))
vi.mock('@comic-code/github', () => ({
  prepareRepository: mocks.prepareRepository,
  githubRequestStatus: (error: { status?: number }) => error?.status,
}))
vi.mock('@comic-code/database', () => ({
  createExplanation: mocks.createExplanation,
  getExplanationByIdempotencyKey: mocks.getExisting,
  countRecentExplanations: mocks.countRecent,
  saveRepositoryScan: mocks.saveScan,
  saveExplanationAnalysis: mocks.saveAnalysis,
  failExplanation: mocks.fail,
  setExplanationTriggerRun: mocks.setRun,
  recordAuditEvent: vi.fn(async () => undefined),
}))
vi.mock('@/lib/auth/session', () => ({
  requireRequestSession: async () => ({
    userId: 'user',
    accessToken: 'test-token',
  }),
  UnauthorizedError: class extends Error {},
}))
vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    SAFETY_IDENTIFIER_SECRET: 'test-secret',
    NEXT_PUBLIC_APP_URL: 'https://example.com',
  }),
}))
vi.mock('@/lib/server', () => ({
  databaseClient: () => ({}),
  githubClient: () => mocks.github,
  explanationIdempotencyKey: mocks.idempotency,
  publicExplanation: async (row: unknown) => row,
}))

import { POST } from './route'

const sha = 'a'.repeat(40)
function request(commitSha: string | null = sha) {
  return new Request('https://example.com/api/v1/explanations', {
    method: 'POST',
    headers: {
      origin: 'https://example.com',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      owner: 'owner',
      repository: 'repo',
      ref: 'feature/fix',
      commitSha: commitSha ?? undefined,
    }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.github.assertUserCanReadRepository.mockResolvedValue({
    isPrivate: false,
  })
  // Inspection captured SHA a; the branch can now point at SHA b.
  mocks.github.getRepositorySnapshot.mockResolvedValue({
    owner: 'owner',
    repository: 'repo',
    defaultBranch: 'main',
    resolvedRef: sha,
    commitSha: sha,
  })
  mocks.getExisting.mockResolvedValue(null)
  mocks.idempotency.mockImplementation((_user, input) =>
    input.forceRegenerate ? 'retry-key' : 'stable-key',
  )
  mocks.countRecent.mockResolvedValue(0)
  mocks.prepareRepository.mockResolvedValue({
    snapshot: {
      owner: 'owner',
      repository: 'repo',
      resolvedRef: 'feature/fix',
      commitSha: sha,
    },
    maskedDescription: '',
    evidence: [],
    excludedFiles: [],
    selectedFiles: ['src/index.ts'],
    totalTreeFiles: 1,
    excludedFileCount: 0,
    scannedCharacters: 100,
  })
  mocks.createExplanation.mockResolvedValue({
    id: 'explanation',
    trigger_run_id: null,
    status: 'queued',
  })
  mocks.saveScan.mockResolvedValue(undefined)
  mocks.saveAnalysis.mockResolvedValue(undefined)
  mocks.fail.mockResolvedValue(undefined)
  mocks.setRun.mockResolvedValue(undefined)
  mocks.trigger.mockResolvedValue({ id: 'run' })
})

describe('captured repository generation and dispatch recovery', () => {
  it('uses the inspected commit even after the branch moves', async () => {
    const response = await POST(request())
    expect(response.status).toBe(202)
    expect(mocks.github.getRepositorySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ ref: sha }),
      true,
      'test-token',
    )
    expect(mocks.prepareRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedCommitSha: sha,
        coordinate: expect.objectContaining({ ref: 'feature/fix' }),
      }),
    )
    expect(mocks.createExplanation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ commitSha: sha, resolvedRef: 'feature/fix' }),
    )
  })

  it('rejects generation without an inspected SHA', async () => {
    const response = await POST(request('invalid'))
    expect(response.status).toBe(400)
    expect(mocks.trigger).not.toHaveBeenCalled()
  })

  it('rejects a missing inspected SHA before GitHub or dispatch', async () => {
    expect((await POST(request(null))).status).toBe(400)
    expect(mocks.github.getRepositorySnapshot).not.toHaveBeenCalled()
    expect(mocks.trigger).not.toHaveBeenCalled()
  })

  it('rejects an unexpected commit returned by GitHub', async () => {
    mocks.github.getRepositorySnapshot.mockResolvedValue({
      commitSha: 'b'.repeat(40),
    })
    expect((await POST(request())).status).toBe(409)
    expect(mocks.prepareRepository).not.toHaveBeenCalled()
    expect(mocks.trigger).not.toHaveBeenCalled()
  })

  it('marks a dispatch failure retryable and allows the next ordinary request', async () => {
    mocks.trigger.mockRejectedValueOnce(new Error('dispatch unavailable'))
    expect((await POST(request())).status).toBe(500)
    expect(mocks.fail).toHaveBeenCalledWith(expect.anything(), {
      explanationId: 'explanation',
      errorCode: 'generation_dispatch_failed',
      onlyUndispatched: true,
    })
    mocks.getExisting.mockResolvedValue({ id: 'explanation', status: 'failed' })
    mocks.createExplanation.mockResolvedValue({
      id: 'retry-explanation',
      trigger_run_id: null,
      status: 'queued',
    })
    expect((await POST(request())).status).toBe(202)
    expect(mocks.trigger).toHaveBeenLastCalledWith(
      'generate-comic',
      { explanationId: 'retry-explanation' },
      expect.objectContaining({ idempotencyKey: 'retry-key' }),
    )
  })

  it('marks a persistence failure before dispatch retryable', async () => {
    mocks.saveScan.mockRejectedValueOnce(new Error('database unavailable'))
    expect((await POST(request())).status).toBe(500)
    expect(mocks.fail).toHaveBeenCalled()
    expect(mocks.trigger).not.toHaveBeenCalled()
  })

  it('recovers an interrupted row with analysis but no recorded run', async () => {
    mocks.getExisting.mockResolvedValue({
      id: 'interrupted',
      status: 'illustrating',
      trigger_run_id: null,
      analysis: { claims: [] },
    })
    expect((await POST(request())).status).toBe(200)
    expect(mocks.trigger).toHaveBeenCalledWith(
      'generate-comic',
      { explanationId: 'interrupted' },
      expect.objectContaining({ idempotencyKey: 'stable-key' }),
    )
    expect(mocks.createExplanation).not.toHaveBeenCalled()
  })

  it('reuses a successfully dispatched explanation without duplicating the job', async () => {
    mocks.getExisting.mockResolvedValue({
      id: 'existing',
      status: 'illustrating',
      trigger_run_id: 'run',
    })
    expect((await POST(request())).status).toBe(200)
    expect(mocks.trigger).not.toHaveBeenCalled()
    expect(mocks.createExplanation).not.toHaveBeenCalled()
  })
})
