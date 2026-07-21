import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSupabaseAdmin } from './client'

describe('getSupabaseAdmin', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('initializes when the runtime has no native WebSocket', () => {
    vi.stubGlobal('WebSocket', undefined)

    expect(() =>
      getSupabaseAdmin({
        url: 'https://example.supabase.co',
        secretKey: 'test-service-key',
      }),
    ).not.toThrow()
  })
})
