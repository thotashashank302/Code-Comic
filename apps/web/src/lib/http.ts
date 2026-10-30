import { ZodError } from 'zod'
import { getServerEnv } from '@/lib/env'
import { UnauthorizedError } from '@/lib/auth/session'

export function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('Content-Type', 'application/json')
  return Response.json(body, { ...init, headers })
}

export function safeReturnTo(value: string | null) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    return '/'
  return value.slice(0, 1_024)
}

export function safeExtensionRedirect(
  value: string | null,
  allowedIds: readonly string[] = [],
) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      !/^[a-p]{32}\.chromiumapp\.org$/.test(url.hostname) ||
      url.pathname !== '/comic-code' ||
      Boolean(url.username || url.password || url.port) ||
      !allowedIds.includes(url.hostname.split('.')[0]!)
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
    throw new HttpError(403, 'invalid_request_origin')
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
  if (error instanceof ZodError)
    return jsonNoStore({ error: 'invalid_request' }, { status: 400 })
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'explanation_not_found'
  )
    return jsonNoStore({ error: 'explanation_not_found' }, { status: 404 })
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
