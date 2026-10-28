export function isLocalRuntime() {
  const mode =
    process.env.COMIC_CODE_MODE ?? (process.env.VERCEL ? 'hosted' : 'local')
  if (mode !== 'local' && mode !== 'hosted') {
    throw new Error('COMIC_CODE_MODE must be local or hosted')
  }
  return mode === 'local'
}

export function isLoopbackUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
  } catch {
    return false
  }
}

// Local mode is one user's desktop tool. Never expose it as an anonymous host.
export function localRequestAllowed(request: Request) {
  if (!isLoopbackUrl(request.url)) return false
  const host = request.headers.get('host')
  if (host && !isLoopbackUrl(`http://${host}`)) return false
  const origin = request.headers.get('origin')
  const extension = origin && /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
  // Next rewrites can normalize 127.0.0.1 to localhost internally. Both
  // loopback names on this exact port refer to this single desktop service.
  if (origin && !extension) {
    const target = new URL(request.url)
    if (!isLoopbackUrl(origin)) return false
    const source = new URL(origin)
    if (source.protocol !== target.protocol || source.port !== target.port)
      return false
  }
  return ['GET', 'HEAD'].includes(request.method) || Boolean(origin)
}
