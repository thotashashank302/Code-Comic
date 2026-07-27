import type { RepositoryTreeFile } from './types'

const excludedBasenames = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'composer.lock',
  'gemfile.lock',
  'poetry.lock',
  'cargo.lock',
])

const excludedExtensions = new Set([
  '.7z',
  '.avi',
  '.bmp',
  '.class',
  '.dll',
  '.dmg',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.lock',
  '.map',
  '.mov',
  '.mp3',
  '.mp4',
  '.pdf',
  '.png',
  '.so',
  '.tar',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
])

const documentationExtensions = new Set([
  '.adoc',
  '.asc',
  '.md',
  '.mdx',
  '.org',
  '.rst',
  '.rtf',
  '.txt',
])

const excludedSegments = [
  '/.git/',
  '/.next/',
  '/.output/',
  '/.turbo/',
  '/.wxt/',
  '/dist/',
  '/build/',
  '/coverage/',
  '/node_modules/',
  '/vendor/',
  '/snapshots/',
  '/__snapshots__/',
  '/fixtures/',
]

const sensitiveBasenames = new Set([
  '.env',
  '.env.local',
  '.npmrc',
  '.pypirc',
  'id_rsa',
  'id_ed25519',
])

const manifestBasenames = new Set([
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'pom.xml',
  'build.gradle',
  'go.mod',
  'cargo.toml',
  'composer.json',
  'gemfile',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
])

function basename(path: string) {
  return path.split('/').at(-1)?.toLowerCase() ?? path.toLowerCase()
}

function extension(path: string) {
  const file = basename(path)
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(dot) : ''
}

export function isReadmePath(path: string) {
  return /^readme(?:\.[a-z0-9]+)?$/i.test(basename(path))
}

export function isManifestPath(path: string) {
  const file = basename(path)
  return (
    manifestBasenames.has(file) ||
    /^requirements(?:-[a-z0-9._-]+)?\.txt$/i.test(file)
  )
}

export function exclusionReason(path: string): string | null {
  const normalized = `/${path.toLowerCase().replace(/^\/+/, '')}`
  const file = basename(normalized)

  if (sensitiveBasenames.has(file) || file.startsWith('.env.')) {
    return 'sensitive-file'
  }
  if (excludedBasenames.has(file)) return 'lockfile'
  if (excludedExtensions.has(extension(file))) return 'binary-or-generated'
  if (excludedSegments.some((segment) => normalized.includes(segment))) {
    return 'vendored-or-generated'
  }
  if (file.endsWith('.min.js') || file.endsWith('.min.css')) return 'minified'
  if (documentationExtensions.has(extension(file)) && !isReadmePath(path)) {
    return 'documentation'
  }
  return null
}

export function scoreRepositoryFile(file: RepositoryTreeFile) {
  const path = file.path.toLowerCase()
  const name = basename(path)
  let score = 0

  if (isReadmePath(path)) score += 1_400
  if (isManifestPath(path)) score += 1_200
  if (
    /(^|\/)(index|main|app|server|route|router|worker|cli)\.[a-z0-9]+$/.test(
      path,
    )
  ) {
    score += 700
  }
  if (
    /(^|\/)(src|app|apps|packages|server|api|lib|core|services|routes|controllers|models|database|db)\//.test(
      path,
    )
  ) {
    score += 350
  }
  if (/auth|security|session|middleware|schema|migration/.test(path)) {
    score += 220
  }
  if (/(^|\/)(__tests__|tests?|specs?)\//.test(path)) score -= 180
  if (/\.test\.|\.spec\./.test(name)) score -= 180

  const depth = path.split('/').length - 1
  score -= depth * 12
  score -= Math.min(Math.floor(file.size / 25_000), 120)
  return score
}

function directoryBucket(path: string) {
  const segments = path.split('/')
  return segments.length > 1 ? segments.slice(0, 2).join('/') : '.'
}

export function selectRepositoryFiles(files: RepositoryTreeFile[], limit = 40) {
  const excluded: string[] = []
  const eligible = files.filter((file) => {
    const reason = exclusionReason(file.path)
    if (reason || file.size > 750_000 || file.size === 0) {
      excluded.push(file.path)
      return false
    }
    return true
  })
  const ranked = [...eligible].sort(
    (left, right) =>
      scoreRepositoryFile(right) - scoreRepositoryFile(left) ||
      left.path.localeCompare(right.path),
  )

  const selected: RepositoryTreeFile[] = []
  const bucketCounts = new Map<string, number>()
  for (const file of ranked) {
    const bucket = directoryBucket(file.path)
    const count = bucketCounts.get(bucket) ?? 0
    if (count >= 8 && ranked.length > limit) continue
    selected.push(file)
    bucketCounts.set(bucket, count + 1)
    if (selected.length === Math.min(limit, 40)) break
  }
  for (const file of ranked) {
    if (selected.length === Math.min(limit, 40)) break
    if (!selected.includes(file)) selected.push(file)
  }

  return { selected, excluded }
}
