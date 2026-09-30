import { describe, expect, it } from 'vitest'

import { parseGitHubRepositoryUrl } from './types'

describe('parseGitHubRepositoryUrl', () => {
  it('accepts repository roots and explicit tree refs', () => {
    expect(
      parseGitHubRepositoryUrl('https://github.com/openai/openai-node'),
    ).toEqual({
      owner: 'openai',
      repository: 'openai-node',
    })
    expect(
      parseGitHubRepositoryUrl(
        'https://github.com/openai/openai-node/tree/release/src',
      ),
    ).toEqual({
      owner: 'openai',
      repository: 'openai-node',
      ref: 'release/src',
    })
  })

  it('rejects non-repository URLs', () => {
    expect(
      parseGitHubRepositoryUrl('https://example.com/owner/repo'),
    ).toBeNull()
    expect(parseGitHubRepositoryUrl('https://github.com/owner')).toBeNull()
    expect(
      parseGitHubRepositoryUrl('https://github.com/owner/repo/issues/1'),
    ).toBeNull()
  })
})
