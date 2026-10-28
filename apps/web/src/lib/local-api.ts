import { createHash, randomUUID } from 'node:crypto'

import {
  composeComic,
  createDeterministicComicAnalysis,
  createStoryboardFallbackArtwork,
  deterministicFallbackModels,
} from '@comic-code/comic'
import {
  createExplanationRequestSchema,
  regenerateArtworkRequestSchema,
} from '@comic-code/contracts'
import {
  GitHubAppClient,
  githubRequestStatus,
  parseGitHubRepositoryUrl,
  prepareRepository,
  selectRepositoryFiles,
} from '@comic-code/github'

import { localStore, publicLocalComic, type LocalComic } from './local-store'
import { detectedLanguages } from './repository-summary'
import { isLocalRuntime, localRequestAllowed } from './runtime-mode'

class LocalError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const runtime = globalThis as typeof globalThis & {
  comicCodeLocalBusy?: boolean
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

// One process owns the local data directory. A bounded operation slot prevents
// double submissions, disk races, and deletion being undone by an AI response.
async function mutate<T>(operation: () => Promise<T>) {
  if (runtime.comicCodeLocalBusy) throw new LocalError(409, 'local_busy')
  runtime.comicCodeLocalBusy = true
  try {
    return await operation()
  } finally {
    runtime.comicCodeLocalBusy = false
  }
}

async function body(request: Request) {
  const text = await request.text()
  if (text.length > 16_384) throw new LocalError(413, 'request_too_large')
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new LocalError(400, 'invalid_json')
  }
}

function github() {
  return new GitHubAppClient()
}
function token() {
  return process.env.GITHUB_TOKEN?.trim() || undefined
}

async function prepare(input: {
  owner: string
  repository: string
  ref?: string
  commitSha: string
}) {
  const client = github()
  const snapshot = await client.getRepositorySnapshot(
    { ...input, ref: input.commitSha },
    true,
    token(),
  )
  if (snapshot.isPrivate) throw new LocalError(403, 'local_public_only')
  const prepared = await prepareRepository({
    client,
    coordinate: input,
    expectedCommitSha: input.commitSha,
    allowPublicFallback: true,
    fallbackAccessToken: token(),
  })
  if (prepared.snapshot.isPrivate)
    throw new LocalError(403, 'local_public_only')
  return prepared
}

async function requireComic(id: string) {
  const record = await localStore().get(id)
  if (!record) throw new LocalError(404, 'comic_not_found')
  return record
}

async function generate(request: Request) {
  const parsed = createExplanationRequestSchema.safeParse(await body(request))
  if (!parsed.success) throw new LocalError(400, 'invalid_generation_request')
  const input = parsed.data
  return mutate(async () => {
    const store = localStore()
    const key = createHash('sha256')
      .update(
        JSON.stringify([
          input.owner.toLowerCase(),
          input.repository.toLowerCase(),
          input.ref ?? '',
          input.commitSha.toLowerCase(),
          deterministicFallbackModels.analysis,
        ]),
      )
      .digest('hex')
    const records = await store.list()
    const existing = records.find((row) => row.key === key)
    if (existing && !input.forceRegenerate)
      return json({ explanation: publicLocalComic(existing) })
    if (records.length >= 100) throw new LocalError(409, 'local_storage_full')
    if (
      records.filter(
        (row) => Date.parse(row.createdAt) > Date.now() - 86_400_000,
      ).length >= 25
    ) {
      throw new LocalError(429, 'daily_quota_reached')
    }
    const prepared = await prepare(input)
    const analysis = {
      ...createDeterministicComicAnalysis({
        repository: `${prepared.snapshot.owner}/${prepared.snapshot.repository}`,
        description: prepared.maskedDescription,
        ref: input.ref ?? prepared.snapshot.defaultBranch,
        commitSha: prepared.snapshot.commitSha,
        evidence: prepared.evidence,
        excludedFiles: prepared.excludedFiles,
        safetyIdentifier: 'local-desktop',
      }),
      artworkProvider: 'template' as const,
    }
    const artwork = await createStoryboardFallbackArtwork(analysis)
    const png = await composeComic(analysis, artwork)
    const record: LocalComic = {
      id: randomUUID(),
      key,
      repository: `${prepared.snapshot.owner}/${prepared.snapshot.repository}`,
      ref: input.ref ?? prepared.snapshot.defaultBranch,
      commitSha: prepared.snapshot.commitSha,
      scanSummary: {
        totalTreeFiles: prepared.totalTreeFiles,
        selectedFileCount: prepared.selectedFiles.length,
        excludedFileCount: prepared.excludedFileCount,
        scannedCharacters: prepared.scannedCharacters,
      },
      analysis,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      png: png.toString('base64'),
    }
    await store.save(record)
    return json({ explanation: publicLocalComic(record) }, 201)
  })
}

async function illustrate(request: Request, id: string) {
  const parsed = regenerateArtworkRequestSchema.safeParse(await body(request))
  if (!parsed.success)
    throw new LocalError(400, 'invalid_image_provider_credentials')
  return mutate(async () => {
    const record = await requireComic(id)
    const [owner, repository] = record.repository.split('/')
    if (!owner || !repository) throw new LocalError(500, 'local_request_failed')
    const prepared = await prepare({
      owner,
      repository,
      ref: record.ref,
      commitSha: record.commitSha,
    })
    const { analyzeCloudflareComic, generateCloudflarePanelArtwork } =
      await import('@comic-code/comic')
    const result = await analyzeCloudflareComic(
      {
        repository: record.repository,
        description: prepared.maskedDescription,
        ref: record.ref,
        commitSha: record.commitSha,
        evidence: prepared.evidence,
        excludedFiles: prepared.excludedFiles,
        safetyIdentifier: 'local-desktop',
      },
      parsed.data,
    )
    const analysis = {
      ...result.analysis,
      artworkProvider: 'cloudflare_byok' as const,
    }
    const artwork = await generateCloudflarePanelArtwork({
      ...parsed.data,
      analysis,
    })
    const png = await composeComic(analysis, artwork)
    // Replace the complete record atomically; failures preserve the free comic.
    await localStore().save({
      ...record,
      analysis,
      png: png.toString('base64'),
    })
    return json({ explanation: publicLocalComic({ ...record, analysis }) })
  })
}

export async function handleLocalApi(request: Request) {
  if (!isLocalRuntime()) return json({ error: 'not_found' }, 404)
  if (!localRequestAllowed(request)) {
    return json({ error: 'invalid_local_origin' }, 403)
  }
  const path = new URL(request.url).pathname.replace(/^\/api\/local/, '')
  const method = request.method
  try {
    if (path === '/health' && method === 'GET') {
      const { default: sharp } = await import('sharp')
      return json({
        ok: Boolean(sharp.versions.vips),
        service: 'comic-code-web',
        mode: 'local',
        imageRuntime: Boolean(sharp.versions.vips),
      })
    }
    if (path === '/v1/auth/me' && method === 'GET') {
      return json({
        user: { id: 'local', login: 'local', avatarUrl: null },
        mode: 'local',
      })
    }
    if (path === '/v1/github/repository' && method === 'GET') {
      const input = new URL(request.url).searchParams.get('url')
      const coordinate = input ? parseGitHubRepositoryUrl(input) : null
      if (!coordinate) throw new LocalError(400, 'invalid_repository_url')
      const client = github()
      const snapshot = await client.getRepositorySnapshot(
        coordinate,
        true,
        token(),
        true,
      )
      if (snapshot.isPrivate) throw new LocalError(403, 'local_public_only')
      const tree = await client.listRepositoryFiles(snapshot, true, token())
      const selection = selectRepositoryFiles(tree)
      if (!selection.selected.length)
        throw new LocalError(400, 'no_executable_code')
      return json({
        repository: {
          ...snapshot,
          ref: snapshot.resolvedRef,
          totalFiles: tree.length,
          selectedFileCount: selection.selected.length,
          excludedFileCount: selection.excluded.length,
          representativeFiles: selection.selected.map((file) => file.path),
          languages: detectedLanguages(
            selection.selected.map((file) => file.path),
          ),
        },
      })
    }
    if (path === '/v1/explanations') {
      if (method === 'POST') return await generate(request)
      if (method === 'GET')
        return json({
          explanations: (await localStore().list()).map(publicLocalComic),
        })
    }
    const match =
      /^\/v1\/explanations\/([^/]+)(?:\/(download|artwork|shares))?$/.exec(path)
    if (match) {
      const [, id, action] = match
      if (!id) throw new LocalError(404, 'comic_not_found')
      if (action === 'shares')
        throw new LocalError(409, 'local_sharing_unavailable')
      if (action === 'artwork' && method === 'POST')
        return await illustrate(request, id)
      if (!action && method === 'DELETE') {
        return await mutate(async () => {
          await requireComic(id)
          await localStore().delete(id)
          return json({ ok: true })
        })
      }
      if (method === 'GET' && (!action || action === 'download')) {
        const record = await requireComic(id)
        if (!action) return json({ explanation: publicLocalComic(record) })
        return new Response(new Uint8Array(Buffer.from(record.png, 'base64')), {
          headers: {
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="comic-${id}.png"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      }
    }
    return json({ error: 'local_feature_unavailable' }, 404)
  } catch (error) {
    if (error instanceof LocalError)
      return json({ error: error.message }, error.status)
    const status = githubRequestStatus(error)
    if (status === 401) return json({ error: 'github_token_invalid' }, 401)
    if (status === 403 || status === 429)
      return json({ error: 'github_rate_limited' }, 429)
    if (status === 404) return json({ error: 'repository_not_found' }, 404)
    if (
      error instanceof Error &&
      error.message === 'repository_tree_truncated'
    ) {
      return json({ error: 'repository_too_large' }, 422)
    }
    if (
      error instanceof Error &&
      error.message.includes('no readable executable')
    ) {
      return json({ error: 'no_executable_code' }, 400)
    }
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : ''
    if (
      [
        'image_provider_auth_failed',
        'image_provider_quota_reached',
        'image_provider_unavailable',
        'cloudflare_analysis_failed',
      ].includes(code)
    ) {
      return json(
        { error: code },
        code === 'image_provider_auth_failed'
          ? 401
          : code === 'image_provider_quota_reached'
            ? 429
            : 502,
      )
    }
    // Log only the failure category; never upstream bodies, tokens or source.
    console.error('Local comic request failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    return json({ error: 'local_request_failed' }, 500)
  }
}
