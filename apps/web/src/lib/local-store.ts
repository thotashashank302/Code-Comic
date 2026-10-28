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
  png: z.string().max(14_000_000),
})
export type LocalComic = z.infer<typeof recordSchema>

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
      if (Date.parse(record.expiresAt) <= Date.now()) {
        await this.delete(id)
        return null
      }
      return record
    } catch (error) {
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
    const rows: LocalComic[] = []
    for (const name of names) {
      if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue
      const row = await this.get(name.slice(0, -5))
      if (row) rows.push(row)
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

export function publicLocalComic(record: LocalComic) {
  return {
    id: record.id,
    repository: record.repository,
    ref: record.ref,
    commitSha: record.commitSha,
    scanSummary: record.scanSummary,
    status: 'completed',
    progress: {
      percent: 100,
      message:
        record.analysis.artworkProvider === 'cloudflare_byok'
          ? 'Comic ready · Cloudflare artwork'
          : 'Comic ready · free structural scan',
      updatedAt: record.createdAt,
    },
    analysis: record.analysis,
    artifactUrl: `/api/v1/explanations/${record.id}/download`,
    errorCode: null,
    error: null,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  }
}
