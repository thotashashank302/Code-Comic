import { afterEach, describe, expect, it, vi } from 'vitest'

import { isLocalRuntime, localRequestAllowed } from './runtime-mode'

afterEach(() => vi.unstubAllEnvs())

describe('local runtime boundaries', () => {
  it('requires hosted mode on Vercel and rejects unknown mode values', () => {
    vi.stubEnv('COMIC_CODE_MODE', undefined)
    vi.stubEnv('VERCEL', '1')
    expect(isLocalRuntime()).toBe(false)
    vi.stubEnv('COMIC_CODE_MODE', 'typo')
    expect(() => isLocalRuntime()).toThrow('local or hosted')
  })

  it('rejects remote hosts, cross-origin mutations and forged bearer bypasses', () => {
    for (const request of [
      new Request('https://public.example/api/local/health'),
      new Request('http://localhost:3000/api/local/health', {
        headers: { Host: 'evil.example' },
      }),
      new Request('http://localhost:3000/api/local/health', {
        method: 'POST',
        headers: {
          Origin: 'https://evil.example',
          Authorization: 'Bearer forged',
        },
      }),
      new Request('http://localhost:3000/api/local/health', { method: 'POST' }),
    ])
      expect(localRequestAllowed(request)).toBe(false)
  })

  it('accepts same-origin mutations after Next rewrites localhost and extension requests', () => {
    expect(
      localRequestAllowed(
        new Request('http://localhost:3000/api/local/x', {
          method: 'POST',
          headers: { Host: 'localhost:3000', Origin: 'http://127.0.0.1:3000' },
        }),
      ),
    ).toBe(true)
    expect(
      localRequestAllowed(
        new Request('http://localhost:3000/api/local/x', {
          method: 'POST',
          headers: { Origin: `chrome-extension://${'a'.repeat(32)}` },
        }),
      ),
    ).toBe(true)
    expect(
      localRequestAllowed(
        new Request('http://localhost:3000/api/local/x', {
          method: 'POST',
          headers: { Origin: 'http://localhost:4000' },
        }),
      ),
    ).toBe(false)
  })
})
