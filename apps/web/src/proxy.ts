import { NextRequest, NextResponse } from 'next/server'

import { isLocalRuntime, isLoopbackUrl } from './lib/runtime-mode'

export function proxy(request: NextRequest) {
  if (!isLocalRuntime()) return NextResponse.next()
  if (
    !isLoopbackUrl(request.url) ||
    !isLoopbackUrl(`http://${request.headers.get('host')}`)
  ) {
    return NextResponse.json(
      { error: 'local_mode_requires_loopback' },
      { status: 403 },
    )
  }
  if (
    request.nextUrl.pathname.startsWith('/api/') &&
    !request.nextUrl.pathname.startsWith('/api/local/')
  ) {
    const destination = request.nextUrl.clone()
    destination.pathname = `/api/local${destination.pathname.slice(4)}`
    return NextResponse.rewrite(destination)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
