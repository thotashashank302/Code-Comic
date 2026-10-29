import { setTimeout as pause } from 'node:timers/promises'

// Retry one idempotent read only. Never retry quota/auth failures or mutations.
// One deadline covers both attempts and the eventual streamed response body.
export const githubFetch: typeof fetch = async (input, options) => {
  const inheritedSignal =
    options?.signal ?? (input instanceof Request ? input.signal : undefined)
  const signal = AbortSignal.any([
    AbortSignal.timeout(20_000),
    ...(inheritedSignal ? [inheritedSignal] : []),
  ])
  const init = { ...options, signal }
  const method =
    options?.method ?? (input instanceof Request ? input.method : 'GET')
  if (method.toUpperCase() !== 'GET') return fetch(input, init)

  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await fetch(input, init)
    } catch (cause) {
      if (signal.aborted || attempt === 1)
        throw Object.assign(
          new Error('GitHub connection unavailable', { cause }),
          { status: 503 },
        )
      await pause(250, undefined, { signal })
      continue
    }
    if (attempt === 1 || ![500, 502, 503, 504].includes(response.status))
      return response
    await response.body?.cancel()
    await pause(250, undefined, { signal })
  }
}
