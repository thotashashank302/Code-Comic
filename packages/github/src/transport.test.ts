import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubAppClient } from './client'

async function client() {
  return new GitHubAppClient().getRepositoryOctokit('owner', 'repo', true)
}
function response() {
  return new Response(JSON.stringify({ name: 'repo' }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
afterEach(() => vi.unstubAllGlobals())

describe('bounded GitHub read recovery', () => {
  it('recovers from one connection failure without dropping the request', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(
        new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }),
      )
      .mockResolvedValueOnce(response())
    vi.stubGlobal('fetch', fetch)
    expect(
      (await (await client()).request('GET /repos/owner/repo')).data,
    ).toEqual({ name: 'repo' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([500, 502, 503, 504])(
    'recovers from one temporary %i response',
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response('temporary', { status }))
        .mockResolvedValueOnce(response())
      vi.stubGlobal('fetch', fetch)
      expect(
        (await (await client()).request('GET /repos/owner/repo')).data,
      ).toEqual({ name: 'repo' })
      expect(fetch).toHaveBeenCalledTimes(2)
    },
  )

  it('stops after two connection failures', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetch)
    await expect(
      (await client()).request('GET /repos/owner/repo'),
    ).rejects.toMatchObject({ status: 500 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([401, 403, 404, 429])(
    'does not retry permissions, missing data or quota (%i)',
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(new Response('{}', { status }))
      vi.stubGlobal('fetch', fetch)
      await expect(
        (await client()).request('GET /repos/owner/repo'),
      ).rejects.toMatchObject({ status })
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )

  it('never retries a mutation', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetch)
    await expect(
      (await client()).request('POST /repos/owner/repo/issues', {
        title: 'not sent',
      }),
    ).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry after cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn().mockRejectedValue(controller.signal.reason)
    vi.stubGlobal('fetch', fetch)
    await expect(
      (await client()).request('GET /repos/owner/repo', {
        request: { signal: controller.signal },
      }),
    ).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
