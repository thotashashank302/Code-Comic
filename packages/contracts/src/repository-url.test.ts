import { describe, expect, it } from 'vitest'

import {
  createExplanationRequestSchema,
  parseGitHubRepositoryUrl,
} from './index'

describe('repository URL and captured commit contract', () => {
  it('preserves slash-containing branches and directory suffixes for server resolution', () => {
    expect(
      parseGitHubRepositoryUrl(
        'https://github.com/owner/repo/tree/feature/fix/src',
      ),
    ).toEqual({
      owner: 'owner',
      repository: 'repo',
      ref: 'feature/fix/src',
    })
    expect(
      parseGitHubRepositoryUrl(
        'https://github.com/owner/repo/tree/feature%2Ffix',
      ),
    ).toEqual({
      owner: 'owner',
      repository: 'repo',
      ref: 'feature/fix',
    })
  })

  it('rejects malformed and non-repository addresses', () => {
    for (const url of [
      'http://github.com/owner/repo',
      'https://github.com/settings/profile',
      'https://github.com/owner/repo/issues/1',
      'https://github.com/owner%2Frepo/other',
      'https://github.com/owner/repo/tree/%ZZ',
    ])
      expect(parseGitHubRepositoryUrl(url)).toBeNull()
  })

  it('requires an immutable commit on generation requests', () => {
    expect(
      createExplanationRequestSchema.safeParse({
        owner: 'owner',
        repository: 'repo',
      }).success,
    ).toBe(false)
    expect(
      createExplanationRequestSchema.safeParse({
        owner: 'owner',
        repository: 'repo',
        commitSha: 'branch',
      }).success,
    ).toBe(false)
    expect(
      createExplanationRequestSchema.parse({
        owner: 'owner',
        repository: 'repo',
        ref: 'feature/fix',
        commitSha: 'a'.repeat(40),
      }).commitSha,
    ).toBe('a'.repeat(40))
  })
})
