import type { PersistedEvidenceLocator } from '@comic-code/contracts'

export type RepositoryCoordinate = {
  owner: string
  repository: string
  ref?: string
}

const reservedGitHubSections = new Set([
  'about',
  'account',
  'apps',
  'codespaces',
  'collections',
  'enterprise',
  'explore',
  'features',
  'issues',
  'login',
  'marketplace',
  'new',
  'notifications',
  'orgs',
  'pricing',
  'pulls',
  'search',
  'security',
  'settings',
  'signup',
  'sponsors',
  'topics',
])

export function parseGitHubRepositoryUrl(
  value: string,
): RepositoryCoordinate | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null
    const segments = url.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
    if (segments.length < 2) return null

    const owner = segments[0]!
    const repository = segments[1]!.replace(/\.git$/i, '')
    if (!owner || !repository || reservedGitHubSections.has(owner)) return null

    if (segments.length === 2) return { owner, repository }
    if (segments[2] !== 'tree' || segments.length < 4) return null

    return {
      owner,
      repository,
      ref: segments[3],
    }
  } catch {
    return null
  }
}

export type RepositorySnapshot = {
  owner: string
  repository: string
  description: string
  defaultBranch: string
  resolvedRef: string
  commitSha: string
  treeSha: string
  isPrivate: boolean
  htmlUrl: string
}

export type RepositoryTreeFile = {
  path: string
  sha: string
  size: number
}

export type ChangedFileStatus = 'added' | 'modified' | 'removed' | 'renamed'

export type PreparedRepositoryFile = RepositoryTreeFile & {
  maskedSource: string
}

export type TransientEvidence = {
  locator: PersistedEvidenceLocator
  maskedText: string
}

export type PreparedRepository = {
  snapshot: RepositorySnapshot
  maskedDescription: string
  evidence: TransientEvidence[]
  excludedFiles: string[]
  excludedFileCount: number
  selectedFiles: string[]
  totalTreeFiles: number
  scannedCharacters: number
}
