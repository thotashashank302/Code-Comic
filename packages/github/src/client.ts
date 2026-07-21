import { App } from '@octokit/app'
import { Octokit } from '@octokit/rest'
import { createTwoFilesPatch } from 'diff'

import { selectEligibleFiles } from './filters'
import { maskSecrets } from './secrets'
import type {
  ChangedFile,
  ChangedFileStatus,
  PreparedFile,
  PullRequestSnapshot,
  RepositoryCoordinate,
} from './types'

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

function normalizeStatus(status: string): ChangedFileStatus {
  if (status === 'added' || status === 'removed' || status === 'renamed') {
    return status
  }
  return 'modified'
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
    throw new Error('GitHub did not return a text file')
  }

  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
}

export class GitHubAppClient {
  readonly #app: App

  constructor(config: GitHubAppConfig) {
    const privateKey = Buffer.from(config.privateKeyBase64, 'base64').toString(
      'utf8',
    )
    this.#app = new App({ appId: config.appId, privateKey })
  }

  async getRepositoryOctokit(
    owner: string,
    repository: string,
    allowPublicFallback = false,
    fallbackAccessToken?: string,
  ) {
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
    const response = await this.#app.octokit.request(
      'GET /repos/{owner}/{repo}/installation',
      { owner, repo: repository },
    )
    return response.data.id
  }

  async getPullRequestSnapshot(
    coordinate: RepositoryCoordinate,
    allowPublicFallback = false,
    fallbackAccessToken?: string,
  ): Promise<PullRequestSnapshot> {
    const octokit = await this.getRepositoryOctokit(
      coordinate.owner,
      coordinate.repository,
      allowPublicFallback,
      fallbackAccessToken,
    )
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}',
      {
        owner: coordinate.owner,
        repo: coordinate.repository,
        pull_number: coordinate.pullRequestNumber,
      },
    )

    return {
      ...coordinate,
      title: response.data.title,
      description: response.data.body ?? '',
      baseSha: response.data.base.sha,
      headSha: response.data.head.sha,
      isPrivate: response.data.base.repo.private,
      htmlUrl: response.data.html_url,
    }
  }

  async listChangedFiles(
    coordinate: RepositoryCoordinate,
    allowPublicFallback = false,
    fallbackAccessToken?: string,
  ) {
    const octokit = await this.getRepositoryOctokit(
      coordinate.owner,
      coordinate.repository,
      allowPublicFallback,
      fallbackAccessToken,
    )
    const results: ChangedFile[] = []
    for (let page = 1; ; page += 1) {
      const response = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
        {
          owner: coordinate.owner,
          repo: coordinate.repository,
          pull_number: coordinate.pullRequestNumber,
          per_page: 100,
          page,
        },
      )

      results.push(
        ...response.data.map((file) => ({
          path: file.filename,
          previousPath: file.previous_filename,
          status: normalizeStatus(file.status),
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          blobSha: file.sha,
          patch: file.patch,
        })),
      )
      if (response.data.length < 100) break
    }

    return results
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
      // An expired OAuth token must not make a public repository unusable.
      // Anonymous access cannot reveal private repositories, so this fallback
      // does not weaken the private-repository authorization boundary.
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

  async prepareFiles(input: {
    coordinate: RepositoryCoordinate
    baseSha: string
    headSha: string
    selectedFiles?: string[]
    allowPublicFallback?: boolean
    fallbackAccessToken?: string
  }): Promise<{ prepared: PreparedFile[]; excluded: string[] }> {
    const files = await this.listChangedFiles(
      input.coordinate,
      input.allowPublicFallback,
      input.fallbackAccessToken,
    )
    const { eligible, excluded } = selectEligibleFiles(
      files,
      input.selectedFiles,
    )
    const octokit = await this.getRepositoryOctokit(
      input.coordinate.owner,
      input.coordinate.repository,
      input.allowPublicFallback,
      input.fallbackAccessToken,
    )

    const prepared = await Promise.all(
      eligible.map(async (file): Promise<PreparedFile> => {
        const oldPath = file.previousPath ?? file.path
        let beforePromise: Promise<string> | undefined
        let afterPromise: Promise<string> | undefined
        const before = () =>
          (beforePromise ??=
            file.status === 'added'
              ? Promise.resolve('')
              : octokit
                  .request('GET /repos/{owner}/{repo}/contents/{path}', {
                    owner: input.coordinate.owner,
                    repo: input.coordinate.repository,
                    path: oldPath,
                    ref: input.baseSha,
                  })
                  .then((response) => decodeContent(response.data)))
        const after = () =>
          (afterPromise ??=
            file.status === 'removed'
              ? Promise.resolve('')
              : octokit
                  .request('GET /repos/{owner}/{repo}/contents/{path}', {
                    owner: input.coordinate.owner,
                    repo: input.coordinate.repository,
                    path: file.path,
                    ref: input.headSha,
                  })
                  .then((response) => decodeContent(response.data)))

        let patch = file.patch
        if (!patch) {
          const [beforeContent, afterContent] = await Promise.all([
            before(),
            after(),
          ])
          patch = createTwoFilesPatch(
            oldPath,
            file.path,
            beforeContent,
            afterContent,
            '',
            '',
            {
              context: 4,
            },
          )
        }

        const source = await (
          file.status === 'removed' ? before() : after()
        ).catch(() => null)
        return {
          ...file,
          patch,
          maskedPatch: maskSecrets(patch),
          maskedSource: source === null ? undefined : maskSecrets(source),
        }
      }),
    )

    return { prepared, excluded }
  }
}
