import { getServerEnv } from '@/lib/env'
import { UnauthorizedError } from '@/lib/auth/session'

export function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('Content-Type', 'application/json')
  return Response.json(body, { ...init, headers })
}

export function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value.slice(0, 1_024)
}

export function safeExtensionRedirect(value: string | null) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      !/^[a-p]{32}\.chromiumapp\.org$/.test(url.hostname) ||
      url.pathname !== '/comic-code'
    ) {
      return undefined
    }
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return undefined
  }
}

export function assertSameOrigin(request: Request) {
  if (request.headers.get('authorization')?.startsWith('Bearer ')) return
  const origin = request.headers.get('origin')
  if (
    !origin ||
    origin !== new URL(getServerEnv().NEXT_PUBLIC_APP_URL).origin
  ) {
    throw new Error('Invalid request origin')
  }
}

export function routeErrorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return jsonNoStore(
      { error: error.code, ...(error.detail ? { detail: error.detail } : {}) },
      { status: error.status },
    )
  }
  if (error instanceof UnauthorizedError) {
    return jsonNoStore({ error: 'authentication_required' }, { status: 401 })
  }
  if (error instanceof SyntaxError) {
    return jsonNoStore({ error: 'invalid_json' }, { status: 400 })
  }
  return jsonNoStore({ error: 'request_failed' }, { status: 500 })
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly detail?: string,
  ) {
    super(code)
    this.name = 'HttpError'
  }
}
