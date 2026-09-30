import { describe, expect, it } from 'vitest'

import {
  exclusionReason,
  scoreRepositoryFile,
  selectRepositoryFiles,
} from './filters'

describe('repository architecture filtering', () => {
  it('keeps README context but excludes unrelated documentation and secrets', () => {
    expect(exclusionReason('README.md')).toBeNull()
    expect(exclusionReason('docs/guide.mdx')).toBe('documentation')
    expect(exclusionReason('.env.production')).toBe('sensitive-file')
    expect(exclusionReason('src/route.ts')).toBeNull()
  })

  it('prioritizes manifests and entrypoints across the repository', () => {
    const files = [
      { path: 'docs/guide.md', sha: 'a', size: 100 },
      { path: 'src/utils/tiny.ts', sha: 'b', size: 100 },
      { path: 'src/server.ts', sha: 'c', size: 2_000 },
      { path: 'package.json', sha: 'd', size: 1_000 },
      { path: 'README.md', sha: 'e', size: 2_000 },
    ]
    const result = selectRepositoryFiles(files, 4)

    expect(result.selected.map((file) => file.path)).toEqual([
      'README.md',
      'package.json',
      'src/server.ts',
      'src/utils/tiny.ts',
    ])
    expect(result.excluded).toEqual(['docs/guide.md'])
    expect(scoreRepositoryFile(files[4]!)).toBeGreaterThan(
      scoreRepositoryFile(files[1]!),
    )
  })
})
