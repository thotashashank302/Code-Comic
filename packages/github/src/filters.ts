import type { ChangedFile } from './types'

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
  '/dist/',
  '/build/',
  '/coverage/',
  '/node_modules/',
  '/vendor/',
  '/snapshots/',
  '/__snapshots__/',
]

const sensitiveBasenames = new Set([
  '.env',
  '.env.local',
  '.npmrc',
  '.pypirc',
  'id_rsa',
  'id_ed25519',
])

function basename(path: string) {
  return path.split('/').at(-1)?.toLowerCase() ?? path.toLowerCase()
}

function extension(path: string) {
  const file = basename(path)
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(dot) : ''
}

export function exclusionReason(path: string): string | null {
  const normalized = `/${path.toLowerCase().replace(/^\/+/, '')}`
  const file = basename(normalized)

  if (sensitiveBasenames.has(file) || file.startsWith('.env.')) {
    return 'sensitive-file'
  }

  if (excludedBasenames.has(file)) return 'lockfile'
  if (documentationExtensions.has(extension(file))) return 'documentation'
  if (excludedExtensions.has(extension(file))) return 'binary-or-generated'
  if (excludedSegments.some((segment) => normalized.includes(segment))) {
    return 'vendored-or-generated'
  }

  if (file.endsWith('.min.js') || file.endsWith('.min.css')) {
    return 'minified'
  }

  return null
}

export function scoreChangedFile(file: ChangedFile): number {
  const path = file.path.toLowerCase()
  const sizeScore = Math.min(file.changes, 500)
  const statusScore =
    file.status === 'added' ? 80 : file.status === 'removed' ? 40 : 60
  const manifestScore =
    /(^|\/)(package\.json|pyproject\.toml|requirements.*\.txt|pom\.xml|go\.mod)$/.test(
      path,
    )
      ? 120
      : 0
  const entrypointScore =
    /(^|\/)(index|main|app|route|server)\.[a-z0-9]+$/.test(path) ? 60 : 0
  const testPenalty = /(^|\/)(__tests__|tests?|fixtures?)\//.test(path)
    ? -40
    : 0

  return sizeScore + statusScore + manifestScore + entrypointScore + testPenalty
}

export function selectEligibleFiles(files: ChangedFile[], selected?: string[]) {
  const allowedSelection = selected ? new Set(selected) : null
  const excluded: string[] = []
  const eligible = files.filter((file) => {
    if (allowedSelection && !allowedSelection.has(file.path)) return false
    const reason = exclusionReason(file.path)
    if (reason) {
      excluded.push(file.path)
      return false
    }
    return true
  })

  const ranked = [...eligible].sort(
    (a, b) => scoreChangedFile(b) - scoreChangedFile(a),
  )
  return { eligible: ranked.slice(0, 20), excluded }
}
