import { getRequestSession } from '@/lib/auth/session'
import { jsonNoStore } from '@/lib/http'

export async function GET(request: Request) {
  const session = await getRequestSession(request)
  return jsonNoStore({
    user: session
      ? {
          id: session.userId,
          login: session.login,
          avatarUrl: session.avatarUrl,
        }
      : null,
  })
}
