import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { GitHubAppClient, prepareRepository } from '@comic-code/github'

vi.mock('@comic-code/github', async (original) => ({
  ...(await original<typeof import('@comic-code/github')>()),
  prepareRepository: vi.fn(),
}))

import { handleLocalApi } from './local-api'
import { LocalStore } from './local-store'

let directory: string
const sha = 'a'.repeat(40)
const snapshot = {
  owner: 'owner',
  repository: 'example',
  description: 'Example project',
  defaultBranch: 'main',
  resolvedRef: 'main',
  commitSha: sha,
  treeSha: 'b'.repeat(40),
  isPrivate: false,
  htmlUrl: 'https://github.com/owner/example',
}
const transientSource =
  '1: export async function load() {\n2: const response = await fetch(endpoint)\n3: return response.json()\n4: }'

function request(route: string, method = 'GET', payload?: unknown) {
  return new Request(`http://localhost:3000/api/local${route}`, {
    method,
    headers: {
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/json',
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
}
const input = {
  owner: 'owner',
  repository: 'example',
  ref: 'main',
  commitSha: sha,
}

beforeEach(async () => {
  vi.clearAllMocks()
  directory = await mkdtemp(path.join(os.tmpdir(), 'comic-local-test-'))
  vi.stubEnv('COMIC_CODE_DATA_DIR', directory)
  vi.stubEnv('COMIC_CODE_MODE', 'local')
  vi.spyOn(
    GitHubAppClient.prototype,
    'getRepositorySnapshot',
  ).mockResolvedValue(snapshot)
  vi.spyOn(GitHubAppClient.prototype, 'listRepositoryFiles').mockResolvedValue([
    { path: 'src/main.ts', sha, size: 100 },
  ])
  vi.mocked(prepareRepository).mockResolvedValue({
    snapshot,
    maskedDescription: '',
    excludedFiles: [],
    excludedFileCount: 0,
    selectedFiles: ['src/main.ts'],
    totalTreeFiles: 1,
    scannedCharacters: 100,
    evidence: [
      {
        locator: {
          id: 'ev_source',
          source: 'source_file',
          filePath: 'src/main.ts',
          status: 'modified',
          newStart: 1,
          newEnd: 4,
          contentHash: 'c'.repeat(64),
        },
        maskedText: transientSource,
      },
    ],
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

describe('free local flow', () => {
  it('inspects, composes a real PNG, persists across stores, reuses a request and deletes artifacts', async () => {
    const inspected = await handleLocalApi(
      request('/v1/github/repository?url=https://github.com/owner/example'),
    )
    expect(inspected.status).toBe(200)
    expect((await inspected.json()).repository.commitSha).toBe(sha)
    const created = await handleLocalApi(
      request('/v1/explanations', 'POST', input),
    )
    expect(created.status).toBe(201)
    const { explanation } = await created.json()
    expect(explanation.status).toBe('completed')
    expect(explanation.analysis.panels).toHaveLength(4)
    const persisted = await new LocalStore(directory).get(explanation.id)
    expect(persisted?.commitSha).toBe(sha)
    const metadata = await stat(path.join(directory, `${explanation.id}.json`))
    expect(metadata.mode & 0o777).toBe(0o600)
    const saved = await readFile(
      path.join(directory, `${explanation.id}.json`),
      'utf8',
    )
    expect(saved).not.toContain(transientSource)
    const png = await handleLocalApi(
      request(`/v1/explanations/${explanation.id}/download`),
    )
    expect(png.headers.get('Content-Type')).toBe('image/png')
    expect(
      (await sharp(Buffer.from(await png.arrayBuffer())).metadata()).width,
    ).toBeGreaterThan(500)
    const reused = await handleLocalApi(
      request('/v1/explanations', 'POST', input),
    )
    expect((await reused.json()).explanation.id).toBe(explanation.id)
    expect(prepareRepository).toHaveBeenCalledTimes(1)
    const removed = await handleLocalApi(
      request(`/v1/explanations/${explanation.id}`, 'DELETE'),
    )
    expect(removed.status).toBe(200)
    expect(await readdir(directory)).toEqual([])
    expect(
      (
        await handleLocalApi(
          request(`/v1/explanations/${explanation.id}/download`),
        )
      ).status,
    ).toBe(404)
  })

  it('rejects private repositories, malformed generation and path traversal', async () => {
    vi.mocked(
      GitHubAppClient.prototype.getRepositorySnapshot,
    ).mockResolvedValue({ ...snapshot, isPrivate: true })
    expect(
      (await handleLocalApi(request('/v1/explanations', 'POST', input))).status,
    ).toBe(403)
    expect(prepareRepository).not.toHaveBeenCalled()
    expect(
      (
        await handleLocalApi(
          request('/v1/explanations', 'POST', { ...input, commitSha: 'bad' }),
        )
      ).status,
    ).toBe(400)
    expect(await new LocalStore(directory).get('../secret')).toBeNull()
    expect(
      (await handleLocalApi(request('/v1/explanations/not-a-uuid'))).status,
    ).toBe(404)
  })

  it.each(['openai', 'gemini'] as const)(
    'illustrates a saved comic with %s without another GitHub scan or changing its evidence',
    async (provider) => {
      const { explanation } = await (
        await handleLocalApi(request('/v1/explanations', 'POST', input))
      ).json()
      const original = await new LocalStore(directory).get(explanation.id)
      const encoded = (
        await sharp({
          create: { width: 64, height: 64, channels: 3, background: '#e8d8c4' },
        })
          .png()
          .toBuffer()
      ).toString('base64')
      const secret = 'dummy-user-image-key-not-a-real-key'
      vi.mocked(prepareRepository).mockRejectedValue({ status: 429 })
      const upstream = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () =>
          Response.json(
            provider === 'openai'
              ? { data: [{ b64_json: encoded }] }
              : {
                  status: 'completed',
                  steps: [
                    {
                      type: 'model_output',
                      content: [
                        {
                          type: 'image',
                          mime_type: 'image/png',
                          data: encoded,
                        },
                      ],
                    },
                  ],
                },
          ),
        )
      const response = await handleLocalApi(
        request(`/v1/explanations/${explanation.id}/artwork`, 'POST', {
          provider,
          apiKey: secret,
        }),
      )
      expect(response.status).toBe(200)
      expect(prepareRepository).toHaveBeenCalledTimes(1)
      expect(upstream).toHaveBeenCalledTimes(4)
      const persisted = await new LocalStore(directory).get(explanation.id)
      expect(persisted?.commitSha).toBe(original?.commitSha)
      expect(persisted?.analysis).toMatchObject({
        ...original?.analysis,
        artworkProvider: `${provider}_byok`,
      })
      expect(persisted?.png).not.toBe(original?.png)
      expect(JSON.stringify(persisted)).not.toContain(secret)
      expect(JSON.stringify(persisted)).not.toContain(transientSource)
      const downloaded = await handleLocalApi(
        request(`/v1/explanations/${explanation.id}/download`),
      )
      expect(
        await sharp(Buffer.from(await downloaded.arrayBuffer())).metadata(),
      ).toMatchObject({ width: 1600, height: 1200 })
    },
  )

  it.each([
    [401, 'image_provider_auth_failed'],
    [429, 'image_provider_quota_reached'],
    [503, 'image_provider_unavailable'],
  ])(
    'handles a provider %i without losing the free comic or leaking the token',
    async (status, code) => {
      const { explanation } = await (
        await handleLocalApi(request('/v1/explanations', 'POST', input))
      ).json()
      const original = await new LocalStore(directory).get(explanation.id)
      const secret = 'test-image-api-key-never-persist'
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
      const errors = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      const upstream = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(
          async () =>
            new Response(`Rejected credential: ${secret}`, { status }),
        )
      const response = await handleLocalApi(
        request(`/v1/explanations/${explanation.id}/artwork`, 'POST', {
          provider: 'openai',
          apiKey: secret,
        }),
      )
      expect(response.status).toBe(status === 503 ? 502 : status)
      expect(await response.json()).toEqual({ error: code })
      const [url, init] = upstream.mock.calls[0]!
      expect(String(url)).toBe('https://api.openai.com/v1/images/generations')
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        `Bearer ${secret}`,
      )
      expect(String(init?.body)).not.toContain(transientSource.split('\n')[0]!)
      expect(String(init?.body)).not.toContain(secret)
      expect(await new LocalStore(directory).get(explanation.id)).toEqual(
        original,
      )
      expect(JSON.stringify(info.mock.calls)).not.toContain(secret)
      expect(JSON.stringify(errors.mock.calls)).not.toContain(secret)
      expect(
        await readFile(path.join(directory, `${explanation.id}.json`), 'utf8'),
      ).not.toContain(secret)
      expect(
        (
          await handleLocalApi(
            request(`/v1/explanations/${explanation.id}/download`),
          )
        ).status,
      ).toBe(200)
    },
  )

  it('rejects a concurrent deletion while a generation owns the operation slot', async () => {
    const prepared = vi.mocked(prepareRepository).getMockImplementation()!
    let release: (() => void) | undefined
    vi.mocked(prepareRepository).mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return prepared(...args)
    })
    const pending = handleLocalApi(request('/v1/explanations', 'POST', input))
    await vi.waitFor(() => expect(release).toBeDefined())
    expect(
      (
        await handleLocalApi(
          request(
            '/v1/explanations/00000000-0000-4000-8000-000000000000',
            'DELETE',
          ),
        )
      ).status,
    ).toBe(409)
    release!()
    expect((await pending).status).toBe(201)
  })

  it('does not expose the local route in hosted mode', async () => {
    vi.stubEnv('COMIC_CODE_MODE', 'hosted')
    expect((await handleLocalApi(request('/v1/auth/me'))).status).toBe(404)
  })
})
