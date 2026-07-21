import { cookies } from 'next/headers'

import { exchangeGitHubCode, fetchGitHubUser } from '@/lib/auth/github'
import {
  oauthCookieName,
  readOAuthFlow,
  sealSession,
  sessionCookieName,
  sessionCookieOptions,
} from '@/lib/auth/session'
import { getServerEnv } from '@/lib/env'
import { jsonNoStore } from '@/lib/http'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const state = requestUrl.searchParams.get('state')
  const cookieStore = await cookies()
  const flow = await readOAuthFlow(cookieStore.get(oauthCookieName)?.value)
  cookieStore.delete(oauthCookieName)

  if (!code || !state || !flow || flow.state !== state) {
    return jsonNoStore({ error: 'invalid_oauth_callback' }, { status: 400 })
  }

  try {
    const token = await exchangeGitHubCode(code, flow.verifier)
    const user = await fetchGitHubUser(token.access_token)
    const sessionToken = await sealSession({
      kind: 'session',
      userId: String(user.id),
      login: user.login,
      avatarUrl: user.avatar_url,
      accessToken: token.access_token,
    })

    if (flow.extensionRedirect) {
      const redirect = new URL(flow.extensionRedirect)
      redirect.hash = `session=${encodeURIComponent(sessionToken)}`
      return Response.redirect(redirect)
    }

    cookieStore.set(sessionCookieName, sessionToken, sessionCookieOptions())
    return Response.redirect(
      new URL(flow.returnTo ?? '/', getServerEnv().NEXT_PUBLIC_APP_URL),
    )
  } catch {
    return jsonNoStore(
      { error: 'github_authentication_failed' },
      { status: 502 },
    )
  }
}
