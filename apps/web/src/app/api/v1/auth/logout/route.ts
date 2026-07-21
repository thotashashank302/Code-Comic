import { cookies } from 'next/headers'

import { sessionCookieName } from '@/lib/auth/session'
import { assertSameOrigin, jsonNoStore, routeErrorResponse } from '@/lib/http'

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const cookieStore = await cookies()
    cookieStore.delete(sessionCookieName)
    return jsonNoStore({ ok: true })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
