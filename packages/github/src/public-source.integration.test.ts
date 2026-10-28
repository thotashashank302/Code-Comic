import { expect, it } from 'vitest'
import { GitHubAppClient } from './client'

it.runIf(process.env.COMIC_CODE_LIVE_GITHUB === '1')(
  'reads a real public file at the captured commit through raw GitHub',
  async () => {
    const files = await new GitHubAppClient().readRepositoryFiles({
      snapshot: {
        owner: 'thotashashank302',
        repository: 'Code-Comic',
        commitSha: '748172e0d56027af488765616b85682568c5728e',
        treeSha: '',
        description: '',
        defaultBranch: 'main',
        resolvedRef: 'main',
        isPrivate: false,
        htmlUrl: 'https://github.com/thotashashank302/Code-Comic',
      },
      files: [{ path: 'package.json', size: 800, sha: '' }],
      allowPublicFallback: true,
    })
    expect(files).toHaveLength(1)
    expect(files[0]?.maskedSource).toContain('comic-code')
  },
  30_000,
)
