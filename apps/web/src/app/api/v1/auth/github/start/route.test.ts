import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  seal: vi.fn(),
  read: vi.fn(),
  exchange: vi.fn(),
  user: vi.fn(),
  session: vi.fn(),
}))
const approved = 'a'.repeat(32)
const unapproved = 'b'.repeat(32)
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_APP_URL: 'https://example.com',
    ALLOWED_EXTENSION_IDS: ['a'.repeat(32)],
  }),
}))
vi.mock('@/lib/auth/github', () => ({
  githubAuthorizationUrl: () =>
    new URL('https://github.com/login/oauth/authorize'),
  exchangeGitHubCode: mocks.exchange,
  fetchGitHubUser: mocks.user,
}))
vi.mock('@/lib/auth/session', () => ({
  createOAuthValues: () => ({
    state: 'state',
    verifier: 'verifier',
    challenge: 'challenge',
  }),
  oauthCookieName: 'oauth',
  sessionCookieName: 'session',
  sealOAuthFlow: mocks.seal,
  readOAuthFlow: mocks.read,
  sealSession: mocks.session,
  sessionCookieOptions: () => ({}),
  UnauthorizedError: class extends Error {},
}))
import { GET } from './route'
import { GET as callback } from '../callback/route'
import { safeExtensionRedirect } from '@/lib/http'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.cookies.mockResolvedValue({
    set: vi.fn(),
    get: () => ({ value: 'sealed' }),
    delete: vi.fn(),
  })
  mocks.seal.mockResolvedValue('flow')
})
describe('hosted extension OAuth recipients', () => {
  it('refuses an unapproved extension before creating an OAuth flow', async () => {
    const response = await GET(
      new Request(
        `https://example.com/api/v1/auth/github/start?extension_redirect=https://${unapproved}.chromiumapp.org/comic-code`,
      ),
    )
    expect(response.status).toBe(403)
    expect(mocks.seal).not.toHaveBeenCalled()
  })
  it('starts OAuth for the configured extension', async () => {
    expect(
      (
        await GET(
          new Request(
            `https://example.com/api/v1/auth/github/start?extension_redirect=https://${approved}.chromiumapp.org/comic-code`,
          ),
        )
      ).status,
    ).toBe(302)
    expect(mocks.seal).toHaveBeenCalledWith(
      expect.objectContaining({
        extensionRedirect: `https://${approved}.chromiumapp.org/comic-code`,
      }),
    )
  })
  it('rechecks the approved recipient before exchanging an older sealed flow', async () => {
    mocks.read.mockResolvedValue({
      state: 'state',
      verifier: 'verifier',
      extensionRedirect: `https://${unapproved}.chromiumapp.org/comic-code`,
    })
    expect(
      (
        await callback(
          new Request(
            'https://example.com/api/v1/auth/github/callback?code=test&state=state',
          ),
        )
      ).status,
    ).toBe(403)
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(mocks.session).not.toHaveBeenCalled()
  })
  it('permits web login without an extension recipient', async () => {
    expect(
      (
        await GET(
          new Request(
            'https://example.com/api/v1/auth/github/start?return_to=/workspace',
          ),
        )
      ).status,
    ).toBe(302)
  })
  it('rejects extension callback URLs containing credentials or another port', () => {
    expect(
      safeExtensionRedirect(
        `https://user:pass@${approved}.chromiumapp.org/comic-code`,
        [approved],
      ),
    ).toBeUndefined()
    expect(
      safeExtensionRedirect(
        `https://${approved}.chromiumapp.org:444/comic-code`,
        [approved],
      ),
    ).toBeUndefined()
  })
})
