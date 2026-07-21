import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { cookies } from 'next/headers'
import { EncryptJWT, base64url, jwtDecrypt } from 'jose'
import { z } from 'zod'

import { getServerEnv } from '@/lib/env'

export const sessionCookieName =
  process.env.NODE_ENV === 'production'
    ? '__Host-comic_code_session'
    : 'comic_code_session'
export const oauthCookieName =
  process.env.NODE_ENV === 'production'
    ? '__Host-comic_code_oauth'
    : 'comic_code_oauth'

const githubSessionSchema = z.object({
  kind: z.literal('session'),
  userId: z.string().min(1).max(64),
  login: z.string().min(1).max(100),
  avatarUrl: z.url().nullable(),
  accessToken: z.string().min(1),
})

const oauthFlowSchema = z.object({
  kind: z.literal('oauth'),
  state: z.string().min(32),
  verifier: z.string().min(43),
  returnTo: z.string().startsWith('/').optional(),
  extensionRedirect: z.url().optional(),
})

export type GitHubSession = z.infer<typeof githubSessionSchema>
export type OAuthFlow = z.infer<typeof oauthFlowSchema>

function encryptionKey() {
  return createHash('sha256')
    .update(getServerEnv().SESSION_ENCRYPTION_SECRET)
    .digest()
}

async function encrypt(payload: GitHubSession | OAuthFlow, expiresIn: string) {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .encrypt(encryptionKey())
}

async function decrypt(value: string) {
  const { payload } = await jwtDecrypt(value, encryptionKey(), {
    keyManagementAlgorithms: ['dir'],
    contentEncryptionAlgorithms: ['A256GCM'],
  })
  return payload
}

export function createOAuthValues() {
  const verifier = base64url.encode(randomBytes(32))
  const challenge = base64url.encode(
    createHash('sha256').update(verifier).digest(),
  )
  return {
    state: base64url.encode(randomBytes(32)),
    verifier,
    challenge,
  }
}

export async function sealOAuthFlow(flow: OAuthFlow) {
  return encrypt(flow, '10m')
}

export async function readOAuthFlow(value: string | undefined) {
  if (!value) return null
  try {
    return oauthFlowSchema.parse(await decrypt(value))
  } catch {
    return null
  }
}

export async function sealSession(session: GitHubSession) {
  return encrypt(session, '7h')
}

export async function readSessionToken(value: string | undefined) {
  if (!value) return null
  try {
    return githubSessionSchema.parse(await decrypt(value))
  } catch {
    return null
  }
}

export async function getRequestSession(request?: Request) {
  const authorization = request?.headers.get('authorization')
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim()
    return readSessionToken(token)
  }

  const cookieStore = await cookies()
  return readSessionToken(cookieStore.get(sessionCookieName)?.value)
}

export async function requireRequestSession(request?: Request) {
  const session = await getRequestSession(request)
  if (!session) throw new UnauthorizedError()
  return session
}

export function sessionCookieOptions(maxAge = 7 * 60 * 60) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Authentication required')
    this.name = 'UnauthorizedError'
  }
}
