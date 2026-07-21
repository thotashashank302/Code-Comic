import { describe, expect, it } from 'vitest'

import { exclusionReason, selectEligibleFiles } from './filters'

describe('code-only pull request filtering', () => {
  it('excludes documentation formats from executable-code analysis', () => {
    expect(exclusionReason('docs/guide.mdx')).toBe('documentation')
    expect(exclusionReason('README.md')).toBe('documentation')
    expect(exclusionReason('src/route.ts')).toBeNull()
  })

  it('does not present a documentation-only pull request as code', () => {
    const selected = selectEligibleFiles([
      {
        path: 'docs/guide.mdx',
        status: 'modified',
        additions: 1,
        deletions: 0,
        changes: 1,
        blobSha: 'a'.repeat(40),
        patch: '@@ -1 +1 @@\n-old\n+new',
      },
    ])

    expect(selected.eligible).toHaveLength(0)
    expect(selected.excluded).toEqual(['docs/guide.mdx'])
  })
})
