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

describe('public repository failure handling', () => {
  it('can read public repositories without constructing a GitHub App', async () => {
    const client = new GitHubAppClient()
    await expect(client.getRepositoryOctokit('owner', 'repo')).rejects.toThrow(
      'not configured',
    )
    expect(
      await client.getRepositoryOctokit('owner', 'repo', true),
    ).toBeDefined()
  })

  it('rejects a truncated tree rather than describing a partial tree as complete', async () => {
    const { client, request } = setup()
    request
      .mockReset()
      .mockResolvedValue({ data: { truncated: true, tree: [] } })
    await expect(
      client.listRepositoryFiles(
        {
          owner: 'owner',
          repository: 'repo',
          description: '',
          defaultBranch: 'main',
          resolvedRef: 'main',
          commitSha: commit.sha,
          treeSha: commit.commit.tree.sha,
          isPrivate: false,
          htmlUrl: repository.html_url,
        },
        true,
      ),
    ).rejects.toThrow('repository_tree_truncated')
  })

  it('propagates source-fetch rate limits instead of silently dropping files', async () => {
    const { client, request } = setup()
    request.mockReset().mockRejectedValue({ status: 403 })
    await expect(
      client.readRepositoryFiles({
        snapshot: {
          owner: 'owner',
          repository: 'repo',
          description: '',
          defaultBranch: 'main',
          resolvedRef: 'main',
          commitSha: commit.sha,
          treeSha: commit.commit.tree.sha,
          isPrivate: false,
          htmlUrl: repository.html_url,
        },
        files: [{ path: 'main.ts', size: 100, sha: commit.sha }],
        allowPublicFallback: true,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

it('reads anonymous public source at an immutable raw URL without consuming a contents API request', async () => {
  const client = new GitHubAppClient()
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response('export const password = "example"'))
  vi.stubGlobal('fetch', fetch)
  try {
    const files = await client.readRepositoryFiles({
      snapshot: {
        owner: 'owner',
        repository: 'repo',
        description: '',
        defaultBranch: 'main',
        resolvedRef: 'main',
        commitSha: commit.sha,
        treeSha: commit.commit.tree.sha,
        isPrivate: false,
        htmlUrl: repository.html_url,
      },
      files: [{ path: 'src/file name.ts', size: 100, sha: commit.sha }],
      allowPublicFallback: true,
    })
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `https://raw.githubusercontent.com/owner/repo/${commit.sha}/src/file%20name.ts`,
    )
    expect(files).toHaveLength(1)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('bounds streamed raw public source responses', async () => {
  const client = new GitHubAppClient()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('x'.repeat(750_001))),
  )
  try {
    await expect(
      client.readRepositoryFiles({
        snapshot: {
          owner: 'owner',
          repository: 'repo',
          description: '',
          defaultBranch: 'main',
          resolvedRef: 'main',
          commitSha: commit.sha,
          treeSha: commit.commit.tree.sha,
          isPrivate: false,
          htmlUrl: repository.html_url,
        },
        files: [{ path: 'main.ts', size: 100, sha: commit.sha }],
        allowPublicFallback: true,
      }),
    ).rejects.toThrow('size limit')
  } finally {
    vi.unstubAllGlobals()
  }
})
