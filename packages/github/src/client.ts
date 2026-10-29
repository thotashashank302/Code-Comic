import { App } from '@octokit/app'
import { Octokit as RestOctokit } from '@octokit/rest'

import { githubFetch } from './transport'

import { maskSecrets } from './secrets'
import type {
  PreparedRepositoryFile,
  RepositoryCoordinate,
  RepositorySnapshot,
  RepositoryTreeFile,
} from './types'

const Octokit = RestOctokit.defaults({ request: { fetch: githubFetch } })

export type GitHubAppConfig = {
  appId: string
  privateKeyBase64: string
}

export function githubRequestStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return undefined
  }
  return typeof error.status === 'number' ? error.status : undefined
}

function decodeContent(data: unknown): string {
  if (
    !data ||
    typeof data !== 'object' ||
    !('type' in data) ||
    data.type !== 'file' ||
    !('content' in data) ||
    typeof data.content !== 'string' ||
    ('size' in data && typeof data.size === 'number' && data.size > 750_000)
  ) {
    throw new Error('GitHub did not return a bounded text file')
  }

  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
}

async function readPublicSource(
  snapshot: RepositorySnapshot,
  file: RepositoryTreeFile,
) {
  const segments = [
    snapshot.owner,
    snapshot.repository,
    snapshot.commitSha,
    ...file.path.split('/'),
  ]
  const response = await githubFetch(
    `https://raw.githubusercontent.com/${segments.map(encodeURIComponent).join('/')}`,
    {
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    },
  )
  if (!response.ok) {
    throw Object.assign(new Error('Public source request failed'), {
      status: response.status,
    })
  }
  if (!response.body) throw new Error('Public source response was empty')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 750_000)
        throw new Error('Public source exceeds the size limit')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  return Buffer.concat(chunks).toString('utf8')
}

export class GitHubAppClient {
  readonly #app: App | undefined

  constructor(config?: GitHubAppConfig) {
    if (!config) return
    const privateKey = Buffer.from(config.privateKeyBase64, 'base64').toString(
      'utf8',
    )
    this.#app = new App({ appId: config.appId, privateKey, Octokit })
  }

  async getRepositoryOctokit(
    owner: string,
    repository: string,
    allowPublicFallback = false,
    fallbackAccessToken?: string,
  ) {
    if (!this.#app) {
      if (!allowPublicFallback) throw new Error('GitHub App is not configured')
      return new Octokit({
        ...(fallbackAccessToken ? { auth: fallbackAccessToken } : {}),
      })
    }
    try {
      return await this.#app.getInstallationOctokit(
        await this.getInstallationId(owner, repository),
      )
    } catch (error) {
      if (!allowPublicFallback) throw error
      return new Octokit(
        fallbackAccessToken ? { auth: fallbackAccessToken } : undefined,
      )
    }
  }

  async getInstallationId(owner: string, repository: string) {
    if (!this.#app) throw new Error('GitHub App is not configured')
    const response = await this.#app.octokit.request(
      'GET /repos/{owner}/{repo}/installation',
      { owner, repo: repository },
    )
    return response.data.id
  }

  async assertUserCanReadRepository(
    userAccessToken: string,
    owner: string,
    repository: string,
  ) {
    const userOctokit = new Octokit({ auth: userAccessToken })
    try {
      const response = await userOctokit.request('GET /repos/{owner}/{repo}', {
        owner,
        repo: repository,
      })
      return { isPrivate: response.data.private }
    } catch (error) {
      if (githubRequestStatus(error) !== 401) throw error
      try {
        const response = await new Octokit().request(
          'GET /repos/{owner}/{repo}',
          { owner, repo: repository },
        )
        return { isPrivate: response.data.private }
      } catch {
        throw error
      }
    }
  }

  async getRepositorySnapshot(
    coordinate: RepositoryCoordinate,
    allowPublicFallback = false,
    fallbackAccessToken?: string,
    resolveTreePath = false,
  ): Promise<RepositorySnapshot> {
    const octokit = await this.getRepositoryOctokit(
      coordinate.owner,
      coordinate.repository,
      allowPublicFallback,
      fallbackAccessToken,
    )
    const repository = await octokit.request('GET /repos/{owner}/{repo}', {
      owner: coordinate.owner,
      repo: coordinate.repository,
    })
    let resolvedRef = coordinate.ref ?? repository.data.default_branch
    const readCommit = (ref: string) =>
      octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
        owner: coordinate.owner,
        repo: coordinate.repository,
        ref,
      })
    // A GitHub tree URL can contain both a slash-containing branch and a
    // directory. Try the longest ref first; only inspection resolves paths.
    const commit = await (async () => {
      while (true) {
        try {
          return await readCommit(resolvedRef)
        } catch (error) {
          const separator = resolvedRef.lastIndexOf('/')
          if (
            !resolveTreePath ||
            githubRequestStatus(error) !== 404 ||
            separator < 0
          ) {
            throw error
          }
          resolvedRef = resolvedRef.slice(0, separator)
        }
      }
    })()

    return {
      owner: repository.data.owner.login,
      repository: repository.data.name,
      description: repository.data.description ?? '',
      defaultBranch: repository.data.default_branch,
      resolvedRef,
      commitSha: commit.data.sha,
      treeSha: commit.data.commit.tree.sha,
      isPrivate: repository.data.private,
      htmlUrl: repository.data.html_url,
    }
  }

  async listRepositoryFiles(
    snapshot: RepositorySnapshot,
    allowPublicFallback = false,
    fallbackAccessToken?: string,
  ): Promise<RepositoryTreeFile[]> {
    const octokit = await this.getRepositoryOctokit(
      snapshot.owner,
      snapshot.repository,
      allowPublicFallback,
      fallbackAccessToken,
    )
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/git/trees/{tree_sha}',
      {
        owner: snapshot.owner,
        repo: snapshot.repository,
        tree_sha: snapshot.treeSha,
        recursive: '1',
      },
    )

    if (response.data.truncated) {
      throw new Error('repository_tree_truncated')
    }
    return response.data.tree
      .filter(
        (
          item,
        ): item is typeof item & {
          path: string
          sha: string
          size: number
        } =>
          item.type === 'blob' &&
          typeof item.path === 'string' &&
          typeof item.sha === 'string' &&
          typeof item.size === 'number',
      )
      .slice(0, 5_000)
      .map((item) => ({
        path: item.path,
        sha: item.sha,
        size: item.size,
      }))
  }

  async readRepositoryFiles(input: {
    snapshot: RepositorySnapshot
    files: RepositoryTreeFile[]
    allowPublicFallback?: boolean
    fallbackAccessToken?: string
  }): Promise<PreparedRepositoryFile[]> {
    const octokit = await this.getRepositoryOctokit(
      input.snapshot.owner,
      input.snapshot.repository,
      input.allowPublicFallback,
      input.fallbackAccessToken,
    )
    const prepared: PreparedRepositoryFile[] = []

    for (let index = 0; index < input.files.length; index += 8) {
      const batch = input.files.slice(index, index + 8)
      const results = await Promise.all(
        batch.map(async (file) => {
          try {
            if (
              input.allowPublicFallback &&
              !input.snapshot.isPrivate &&
              !input.fallbackAccessToken &&
              !this.#app
            ) {
              return {
                ...file,
                maskedSource: maskSecrets(
                  await readPublicSource(input.snapshot, file),
                ),
              }
            }
            const response = await octokit.request(
              'GET /repos/{owner}/{repo}/contents/{path}',
              {
                owner: input.snapshot.owner,
                repo: input.snapshot.repository,
                path: file.path,
                ref: input.snapshot.commitSha,
              },
            )
            return {
              ...file,
              maskedSource: maskSecrets(decodeContent(response.data)),
            }
          } catch (error) {
            // Rate limits and outages are actionable failures, not empty code.
            if (githubRequestStatus(error) !== 404) throw error
            return null
          }
        }),
      )
      prepared.push(
        ...results.filter(
          (file): file is PreparedRepositoryFile => file !== null,
        ),
      )
    }

    return prepared
  }
}
