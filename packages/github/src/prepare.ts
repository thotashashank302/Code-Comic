import { createHash } from 'node:crypto'

import { maxPersistedExcludedFiles } from '@comic-code/contracts'

import { createSourceFileEvidence } from './evidence'
import { GitHubAppClient } from './client'
import { isManifestPath, isReadmePath, selectRepositoryFiles } from './filters'
import { maskSecrets } from './secrets'
import type {
  PreparedRepository,
  RepositoryCoordinate,
  TransientEvidence,
} from './types'

function metadataEvidence(
  source: 'repository_name' | 'repository_description' | 'directory_structure',
  text: string,
): TransientEvidence {
  const contentHash = createHash('sha256').update(text).digest('hex')
  return {
    locator: {
      id: `ev_${contentHash.slice(0, 20)}`,
      source,
      contentHash,
    },
    maskedText: text,
  }
}

export async function prepareRepository(input: {
  client: GitHubAppClient
  coordinate: RepositoryCoordinate
  expectedCommitSha: string
  allowPublicFallback?: boolean
  fallbackAccessToken?: string
}): Promise<PreparedRepository> {
  const resolvedSnapshot = await input.client.getRepositorySnapshot(
    { ...input.coordinate, ref: input.expectedCommitSha },
    input.allowPublicFallback,
    input.fallbackAccessToken,
  )
  if (
    resolvedSnapshot.commitSha.toLowerCase() !==
    input.expectedCommitSha.toLowerCase()
  ) {
    throw new Error('The repository ref changed before generation started')
  }
  const snapshot = {
    ...resolvedSnapshot,
    resolvedRef: input.coordinate.ref ?? resolvedSnapshot.defaultBranch,
  }

  const tree = await input.client.listRepositoryFiles(
    snapshot,
    input.allowPublicFallback,
    input.fallbackAccessToken,
  )
  const { selected, excluded } = selectRepositoryFiles(tree)
  const prepared = await input.client.readRepositoryFiles({
    snapshot,
    files: selected,
    allowPublicFallback: input.allowPublicFallback,
    fallbackAccessToken: input.fallbackAccessToken,
  })
  if (prepared.length === 0) {
    throw new Error('The repository has no readable executable source')
  }

  const sourceCharacterBudget = 150_000
  const perFileCharacterBudget = Math.max(
    2_500,
    Math.min(12_000, Math.floor(sourceCharacterBudget / prepared.length)),
  )
  const codeEvidence = prepared.flatMap((file) => {
    const evidence = createSourceFileEvidence({
      path: file.path,
      status: 'modified',
      maskedSource: file.maskedSource,
      diffEvidence: [],
      maxCharacters: perFileCharacterBudget,
    })
    const source = isReadmePath(file.path)
      ? ('readme' as const)
      : isManifestPath(file.path)
        ? ('manifest' as const)
        : ('source_file' as const)
    return evidence.map((item) => ({
      ...item,
      locator: { ...item.locator, source },
    }))
  })
  const maskedDescription = maskSecrets(snapshot.description)
  const directorySummary = selected
    .map((file) => file.path)
    .slice(0, 120)
    .join('\n')
  const metadata = [
    metadataEvidence(
      'repository_name',
      `${snapshot.owner}/${snapshot.repository}`,
    ),
    ...(maskedDescription.trim()
      ? [metadataEvidence('repository_description', maskedDescription)]
      : []),
    metadataEvidence('directory_structure', directorySummary),
  ]
  const evidence = [
    ...metadata,
    ...codeEvidence.slice(0, 200 - metadata.length),
  ]

  return {
    snapshot,
    maskedDescription,
    evidence,
    excludedFiles: excluded.slice(0, maxPersistedExcludedFiles),
    excludedFileCount: excluded.length,
    selectedFiles: prepared.map((file) => file.path),
    totalTreeFiles: tree.length,
    scannedCharacters: prepared.reduce(
      (total, file) =>
        total + Math.min(file.maskedSource.length, perFileCharacterBudget),
      0,
    ),
  }
}
