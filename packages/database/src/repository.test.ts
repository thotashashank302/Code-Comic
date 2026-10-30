import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  completeExplanation,
  getExplanationForWorker,
  getOwnedExplanation,
} from './repository'
import { sampleAnalysis } from '../../comic/src/sample'

function database(expiresAt: string, exists = true) {
  const fetch = vi.fn(
    async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const filter = url.searchParams.get('expires_at')
      const readable =
        exists &&
        (!filter || Date.parse(expiresAt) > Date.parse(filter.slice(3)))
      const object = new Headers(
        input instanceof Request ? input.headers : options?.headers,
      )
        .get('accept')
        ?.includes('vnd.pgrst.object')
      const row = { id: 'comic', expires_at: expiresAt }
      if (object && !readable)
        return new Response(
          JSON.stringify({
            code: 'PGRST116',
            details: 'The result contains 0 rows',
            message: 'Cannot coerce the result to a single JSON object',
          }),
          { status: 406, headers: { 'Content-Type': 'application/json' } },
        )
      return new Response(
        JSON.stringify(object ? row : readable ? [row] : []),
        { headers: { 'Content-Type': 'application/json' } },
      )
    },
  )
  const client = createClient(
    'https://example.supabase.co',
    'test-service-key',
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch },
    },
  )
  return { client, fetch }
}

describe('hosted retention and replacement boundaries', () => {
  it.each(['owner', 'worker'] as const)(
    'does not return expired comics to the %s reader',
    async (kind) => {
      const { client, fetch } = database('2000-01-01T00:00:00.000Z')
      const reading =
        kind === 'owner'
          ? getOwnedExplanation(client, 'comic', 'user')
          : getExplanationForWorker(client, 'comic')
      await expect(reading).rejects.toMatchObject({
        code: 'explanation_not_found',
      })
      const url = new URL(String(fetch.mock.calls[0]![0]))
      expect(url.searchParams.get('expires_at')).toMatch(/^gt\./)
      expect(url.searchParams.get('deleted_at')).toBe('is.null')
      if (kind === 'owner')
        expect(url.searchParams.get('owner_user_id')).toBe('eq.user')
    },
  )

  it('returns a safe not-found error when an owned comic is absent', async () => {
    const { client } = database('2100-01-01T00:00:00.000Z', false)
    await expect(
      getOwnedExplanation(client, 'missing', 'user'),
    ).rejects.toMatchObject({ code: 'explanation_not_found' })
  })

  it('returns a live owned comic', async () => {
    const { client } = database('2100-01-01T00:00:00.000Z')
    await expect(
      getOwnedExplanation(client, 'comic', 'user'),
    ).resolves.toMatchObject({ id: 'comic' })
  })

  it('does not publish replacement artwork if the original path changed in another request', async () => {
    const { client, fetch } = database('2100-01-01T00:00:00.000Z', false)
    await expect(
      completeExplanation(client, {
        explanationId: 'comic',
        analysis: sampleAnalysis,
        excludedFiles: [],
        selectedFiles: [],
        artifactPath: 'new.png',
        expectedArtifactPath: 'old.png',
      }),
    ).rejects.toMatchObject({ code: 'artwork_conflict' })
    const url = new URL(String(fetch.mock.calls[0]![0]))
    expect(url.searchParams.get('final_artifact_path')).toBe('eq.old.png')
  })
})
