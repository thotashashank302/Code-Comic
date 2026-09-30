import type { PersistedEvidenceLocator } from '@comic-code/contracts'

export { parseGitHubRepositoryUrl } from '@comic-code/contracts'
export type { RepositoryCoordinate } from '@comic-code/contracts'

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
