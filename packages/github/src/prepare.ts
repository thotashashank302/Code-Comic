import { createHash } from 'node:crypto'

import { createSourceFileEvidence, splitPatchIntoEvidence } from './evidence'
import { GitHubAppClient } from './client'
import { maskSecrets } from './secrets'
import type { PreparedPullRequest, RepositoryCoordinate } from './types'

function metadataEvidence(
  source: 'pull_request_title' | 'pull_request_description',
  text: string,
) {
  const contentHash = createHash('sha256').update(text).digest('hex')
  return {
    locator: {
      id: `ev_${contentHash.slice(0, 20)}`,
      source,
      contentHash,
    },
    maskedText: text,
  } as const
}

export async function preparePullRequest(input: {
  client: GitHubAppClient
  coordinate: RepositoryCoordinate
  expectedHeadSha: string
  selectedFiles?: string[]
  allowPublicFallback?: boolean
  fallbackAccessToken?: string
}): Promise<PreparedPullRequest> {
  const snapshot = await input.client.getPullRequestSnapshot(
    input.coordinate,
    input.allowPublicFallback,
    input.fallbackAccessToken,
  )
  if (snapshot.headSha !== input.expectedHeadSha) {
    throw new Error('The pull request head changed before generation started')
  }

  const { prepared, excluded } = await input.client.prepareFiles({
    coordinate: input.coordinate,
    baseSha: snapshot.baseSha,
    headSha: snapshot.headSha,
    selectedFiles: input.selectedFiles,
    allowPublicFallback: input.allowPublicFallback,
    fallbackAccessToken: input.fallbackAccessToken,
  })

  const changedLines = prepared.reduce((sum, file) => sum + file.changes, 0)
  if (changedLines > 3_000) {
    throw new Error('Selected files exceed the 3,000 changed-line limit')
  }

  const maskedTitle = maskSecrets(snapshot.title)
  const maskedDescription = maskSecrets(snapshot.description)
  const sourceCharacterBudget = 90_000
  const perFileCharacterBudget = Math.max(
    4_500,
    Math.min(24_000, Math.floor(sourceCharacterBudget / prepared.length)),
  )
  const codeEvidence = prepared.flatMap((file) => {
    const diffEvidence = splitPatchIntoEvidence({
      path: file.path,
      oldPath: file.previousPath,
      status: file.status,
      maskedPatch: file.maskedPatch,
    })
    const sourceEvidence = createSourceFileEvidence({
      path: file.path,
      oldPath: file.previousPath,
      status: file.status,
      maskedSource: file.maskedSource,
      diffEvidence,
      maxCharacters: perFileCharacterBudget,
    })
    return sourceEvidence.length > 0 ? sourceEvidence : diffEvidence
  })
  const metadata = [
    metadataEvidence('pull_request_title', maskedTitle),
    ...(maskedDescription.trim()
      ? [metadataEvidence('pull_request_description', maskedDescription)]
      : []),
  ]
  const evidence = [
    ...metadata,
    ...codeEvidence.slice(0, 200 - metadata.length),
  ]

  if (
    !codeEvidence.some(
      (item) =>
        item.locator.source === 'source_file' || item.locator.source === 'diff',
    )
  ) {
    throw new Error('The pull request has no executable code evidence')
  }

  return {
    snapshot,
    maskedTitle,
    maskedDescription,
    evidence,
    excludedFiles: excluded,
    selectedFiles: prepared.map((file) => file.path),
    changedLines,
  }
}
