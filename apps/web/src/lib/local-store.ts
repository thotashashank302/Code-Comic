import { hasByokArtwork } from '@comic-code/contracts/image-providers'
import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

import { comicAnalysisSchema } from '@comic-code/contracts'
import { z } from 'zod'

const recordSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  repository: z.string(),
  ref: z.string(),
  commitSha: z.string().regex(/^[a-f0-9]{40}$/i),
  scanSummary: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ),
  analysis: comicAnalysisSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  png: z.string().max(36_000_000),
  artifactVersion: z.uuid().optional(),
})
export type LocalComic = z.infer<typeof recordSchema>
type LocalComicSummary = Omit<LocalComic, 'png'>

export class CorruptLocalComicError extends Error {
  readonly code = 'local_comic_corrupt'
  constructor() {
    super('local_comic_corrupt')
  }
}

export class LocalStore {
  constructor(readonly directory: string) {}

  private filename(id: string) {
    if (!z.uuid().safeParse(id).success) throw new Error('comic_not_found')
    return path.join(this.directory, `${id}.json`)
  }

  async get(id: string): Promise<LocalComic | null> {
    try {
      const record = recordSchema.parse(
        JSON.parse(await readFile(this.filename(id), 'utf8')),
      )
      if (record.id.toLowerCase() !== id.toLowerCase())
        throw new CorruptLocalComicError()
      if (Date.parse(record.expiresAt) <= Date.now()) {
        await this.delete(id)
        return null
      }
      return record
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof z.ZodError)
        throw new CorruptLocalComicError()
      if (error instanceof Error && error.message === 'comic_not_found')
        return null
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      )
        return null
      throw error
    }
  }

  async list() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const names = await readdir(this.directory)
    const rows: LocalComicSummary[] = []
    for (const name of names) {
      if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue
      try {
        const row = await this.get(name.slice(0, -5))
        if (row) {
          // Do not retain up to 100 full base64 PNGs while listing the library.
          const summary = { ...row, png: undefined }
          rows.push(summary)
        }
      } catch (error) {
        if (!(error instanceof CorruptLocalComicError)) throw error
        // Preserve the original file for recovery; one damaged record must not
        // lock the rest of the user's library or prevent new generation.
        console.warn('Skipped corrupt local comic', { id: name.slice(0, -5) })
      }
    }
    return rows.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    )
  }

  async save(record: LocalComic) {
    const validated = recordSchema.parse(record)
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const destination = this.filename(validated.id)
    const temporary = `${destination}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, JSON.stringify(validated), {
        mode: 0o600,
        flag: 'wx',
      })
      await rename(temporary, destination)
    } finally {
      await rm(temporary, { force: true })
    }
  }

  async delete(id: string) {
    await rm(this.filename(id), { force: true })
  }
}

export function localStore() {
  return new LocalStore(
    path.resolve(process.env.COMIC_CODE_DATA_DIR?.trim() || '.comic-code'),
  )
}

export function publicLocalComic(record: LocalComicSummary) {
  return {
    id: record.id,
    repository: record.repository,
    ref: record.ref,
    commitSha: record.commitSha,
    scanSummary: record.scanSummary,
    status: 'completed',
    progress: {
      percent: 100,
      message: hasByokArtwork(record.analysis.artworkProvider)
        ? 'Comic ready · user-funded AI artwork'
        : 'Comic ready · free structural scan',
      updatedAt: record.createdAt,
    },
    analysis: record.analysis,
    artifactUrl: `/api/v1/explanations/${record.id}/download?v=${encodeURIComponent(record.artifactVersion ?? record.createdAt)}`,
    errorCode: null,
    error: null,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  }
}
