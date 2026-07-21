import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

export type SupabaseAdminConfig = {
  url: string
  secretKey: string
}

let cachedClient: SupabaseClient | undefined
let cachedKey: string | undefined

export function getSupabaseAdmin(config: SupabaseAdminConfig) {
  const cacheKey = `${config.url}:${config.secretKey.slice(0, 12)}`
  if (!cachedClient || cachedKey !== cacheKey) {
    cachedClient = createClient(config.url, config.secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { 'X-Client-Info': 'comic-code-server' } },
      realtime: {
        // Trigger.dev currently runs this task below Node 22, so Supabase needs
        // an explicit transport. `ws` is compatible with Realtime's minimal API.
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    })
    cachedKey = cacheKey
  }
  return cachedClient
}
