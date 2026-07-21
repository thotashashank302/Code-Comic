import type { PersistedEvidenceLocator } from '@comic-code/contracts'

export type RepositoryCoordinate = {
  owner: string
  repository: string
  pullRequestNumber: number
}

export function parseGitHubPullRequestUrl(
  value: string,
): RepositoryCoordinate | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/)
    if (!match) return null
    const pullRequestNumber = Number(match[3])
    if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1) {
      return null
    }
    return {
      owner: decodeURIComponent(match[1]!),
      repository: decodeURIComponent(match[2]!),
      pullRequestNumber,
    }
  } catch {
    return null
  }
}

export type PullRequestSnapshot = RepositoryCoordinate & {
  title: string
  description: string
  baseSha: string
  headSha: string
  isPrivate: boolean
  htmlUrl: string
}

export type ChangedFileStatus = 'added' | 'modified' | 'removed' | 'renamed'

export type ChangedFile = {
  path: string
  previousPath?: string
  status: ChangedFileStatus
  additions: number
  deletions: number
  changes: number
  blobSha: string | null
  patch?: string
}

export type PreparedFile = ChangedFile & {
  patch: string
  maskedPatch: string
  maskedSource?: string
}

export type TransientEvidence = {
  locator: PersistedEvidenceLocator
  maskedText: string
}

export type PreparedPullRequest = {
  snapshot: PullRequestSnapshot
  maskedTitle: string
  maskedDescription: string
  evidence: TransientEvidence[]
  excludedFiles: string[]
  selectedFiles: string[]
  changedLines: number
}
