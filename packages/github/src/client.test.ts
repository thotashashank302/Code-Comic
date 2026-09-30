import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GitHubAppClient } from './client'

vi.mock('@octokit/app', () => ({ App: class {} }))

const repository = {
  owner: { login: 'owner' },
  name: 'repo',
  description: '',
  default_branch: 'main',
  private: false,
  html_url: 'https://github.com/owner/repo',
}
const commit = {
  sha: 'a'.repeat(40),
  commit: { tree: { sha: 'b'.repeat(40) } },
}

function setup() {
  const client = new GitHubAppClient({
    appId: '1',
    privateKeyBase64: 'dGVzdA==',
  })
  const request = vi.fn().mockResolvedValueOnce({ data: repository })
  vi.spyOn(client, 'getRepositoryOctokit').mockResolvedValue({
    request,
  } as unknown as Awaited<ReturnType<typeof client.getRepositoryOctokit>>)
  return { client, request }
}

beforeEach(() => vi.restoreAllMocks())

describe('repository ref resolution', () => {
  it('resolves the longest matching slash-containing branch in a tree URL', async () => {
    const { client, request } = setup()
    request
      .mockRejectedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ data: commit })
    const snapshot = await client.getRepositorySnapshot(
      { owner: 'owner', repository: 'repo', ref: 'feature/fix/src' },
      true,
      'token',
      true,
    )
    expect(request.mock.calls.slice(1).map((call) => call[1].ref)).toEqual([
      'feature/fix/src',
      'feature/fix',
    ])
    expect(snapshot.resolvedRef).toBe('feature/fix')
    expect(snapshot.commitSha).toBe(commit.sha)
  })

  it('does not fall back to a different branch for an exact ref', async () => {
    const { client, request } = setup()
    request.mockRejectedValueOnce({ status: 404 })
    await expect(
      client.getRepositorySnapshot(
        { owner: 'owner', repository: 'repo', ref: 'feature/missing' },
        true,
        'token',
      ),
    ).rejects.toMatchObject({ status: 404 })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('propagates access and rate-limit errors without changing refs', async () => {
    const { client, request } = setup()
    request.mockRejectedValueOnce({ status: 403 })
    await expect(
      client.getRepositorySnapshot(
        { owner: 'owner', repository: 'repo', ref: 'feature/fix/src' },
        true,
        'token',
        true,
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(request).toHaveBeenCalledTimes(2)
  })
})
