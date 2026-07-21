import { cookies } from 'next/headers'

import { githubAuthorizationUrl } from '@/lib/auth/github'
import {
  createOAuthValues,
  oauthCookieName,
  sealOAuthFlow,
  sessionCookieOptions,
} from '@/lib/auth/session'
import { safeExtensionRedirect, safeReturnTo } from '@/lib/http'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const returnTo = safeReturnTo(requestUrl.searchParams.get('return_to'))
  const extensionRedirect = safeExtensionRedirect(
    requestUrl.searchParams.get('extension_redirect'),
  )
  const { state, verifier, challenge } = createOAuthValues()
  const flow = await sealOAuthFlow({
    kind: 'oauth',
    state,
    verifier,
    returnTo,
    extensionRedirect,
  })
  const cookieStore = await cookies()
  cookieStore.set(oauthCookieName, flow, sessionCookieOptions(10 * 60))
  return Response.redirect(githubAuthorizationUrl({ state, challenge }))
}
