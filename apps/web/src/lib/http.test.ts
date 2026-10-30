import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({ NEXT_PUBLIC_APP_URL: 'https://example.com' }),
}))
vi.mock('@/lib/auth/session', () => ({
  UnauthorizedError: class extends Error {},
}))
import { assertSameOrigin, routeErrorResponse, safeReturnTo } from './http'

describe('HTTP recovery and redirect boundaries', () => {
  it.each([
    '/\\attacker.example/path',
    '/\n/attacker.example',
    '//attacker.example',
  ])('rejects unsafe OAuth return path %j', (value) => {
    const result = safeReturnTo(value)
    expect(new URL(result, 'https://example.com').origin).toBe(
      'https://example.com',
    )
    expect(result).toBe('/')
  })
  it('preserves a normal local return path', () =>
    expect(safeReturnTo('/workspace?tab=story#comic')).toBe(
      '/workspace?tab=story#comic',
    ))
  it('returns 403 for an untrusted request origin', async () => {
    let response: Response | undefined
    try {
      assertSameOrigin(
        new Request('https://example.com/api/test', {
          headers: { Origin: 'https://attacker.example' },
        }),
      )
    } catch (error) {
      response = routeErrorResponse(error)
    }
    expect(response?.status).toBe(403)
  })
  it('returns 400 for a schema validation failure rather than a server error', async () => {
    const parsed = z
      .object({ token: z.string().min(40) })
      .safeParse({ token: 'short' })
    expect(parsed.success).toBe(false)
    if (!parsed.success)
      expect(routeErrorResponse(parsed.error).status).toBe(400)
  })
  it('maps a missing or expired explanation to a safe 404', async () => {
    const response = routeErrorResponse(
      Object.assign(new Error('private detail'), {
        code: 'explanation_not_found',
      }),
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'explanation_not_found' })
  })
})
