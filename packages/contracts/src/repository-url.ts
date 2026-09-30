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
  'contact',
  'customer-stories',
  'events',
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
    if (
      !/^[a-z0-9-]+$/i.test(owner) ||
      !/^[a-z0-9_.-]+$/i.test(repository) ||
      reservedGitHubSections.has(owner.toLowerCase())
    )
      return null

    if (segments.length === 2) return { owner, repository }
    if (segments[2] !== 'tree' || segments.length < 4) return null

    return {
      owner,
      repository,
      ref: segments.slice(3).join('/'),
    }
  } catch {
    return null
  }
}
