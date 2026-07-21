import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { verifyGitHubWebhook } from './github-webhook'

describe('verifyGitHubWebhook', () => {
  it('accepts only the matching SHA-256 signature', () => {
    const payload = '{"action":"created"}'
    const secret = 'a-secret-long-enough-for-the-test'
    const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`

    expect(verifyGitHubWebhook(payload, signature, secret)).toBe(true)
    expect(verifyGitHubWebhook(`${payload}x`, signature, secret)).toBe(false)
    expect(verifyGitHubWebhook(payload, null, secret)).toBe(false)
  })
})
