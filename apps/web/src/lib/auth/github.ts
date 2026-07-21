import 'server-only'

import { z } from 'zod'

import { getServerEnv } from '@/lib/env'

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().int().positive().optional(),
})

const githubUserSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  avatar_url: z.url().nullable(),
})

export function githubCallbackUrl() {
  return new URL(
    '/api/v1/auth/github/callback',
    getServerEnv().NEXT_PUBLIC_APP_URL,
  ).href
}

export function githubAuthorizationUrl(input: {
  state: string
  challenge: string
}) {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', getServerEnv().GITHUB_CLIENT_ID)
  url.searchParams.set('redirect_uri', githubCallbackUrl())
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url
}

export async function exchangeGitHubCode(code: string, verifier: string) {
  const env = getServerEnv()
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      code_verifier: verifier,
      redirect_uri: githubCallbackUrl(),
    }),
  })
  if (!response.ok) throw new Error('GitHub authentication failed')
  return tokenResponseSchema.parse(await response.json())
}

export async function fetchGitHubUser(accessToken: string) {
  const response = await fetch('https://api.github.com/user', {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2026-03-10',
    },
  })
  if (!response.ok) throw new Error('GitHub identity validation failed')
  return githubUserSchema.parse(await response.json())
}
