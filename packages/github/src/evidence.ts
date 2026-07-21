import { createHash } from 'node:crypto'

import type { PersistedEvidenceLocator } from '@comic-code/contracts'

import type { ChangedFileStatus, TransientEvidence } from './types'

const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

function hashContent(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function splitPatchIntoEvidence(input: {
  path: string
  oldPath?: string
  status: ChangedFileStatus
  maskedPatch: string
}): TransientEvidence[] {
  const lines = input.maskedPatch.split('\n')
  const evidence: TransientEvidence[] = []
  let startIndex = -1

  const flush = (endIndex: number) => {
    if (startIndex < 0) return
    const text = lines.slice(startIndex, endIndex).join('\n').trim()
    if (!text) return
    const header = lines[startIndex]?.match(hunkHeader)
    if (!header) return

    const oldStart = Number(header[1])
    const oldLength = Number(header[2] ?? '1')
    const newStart = Number(header[3])
    const newLength = Number(header[4] ?? '1')
    const contentHash = hashContent(text)
    const id = `ev_${contentHash.slice(0, 20)}`
    const locator: PersistedEvidenceLocator = {
      id,
      source: 'diff',
      filePath: input.path,
      oldPath: input.oldPath,
      status: input.status,
      oldStart,
      oldEnd: Math.max(oldStart, oldStart + oldLength - 1),
      newStart,
      newEnd: Math.max(newStart, newStart + newLength - 1),
      contentHash,
    }

    evidence.push({ locator, maskedText: text })
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (hunkHeader.test(lines[index] ?? '')) {
      flush(index)
      startIndex = index
    }
  }
  flush(lines.length)

  return evidence
}

export function createSourceContextEvidence(input: {
  path: string
  oldPath?: string
  status: ChangedFileStatus
  maskedSource?: string
  diffEvidence: TransientEvidence[]
}): TransientEvidence[] {
  if (input.maskedSource === undefined) return []
  const sourceLines = input.maskedSource.split('\n')
  const ranges = input.diffEvidence
    .filter((item) => item.locator.source === 'diff')
    .slice(0, 4)
    .map((item) => {
      const changedStart =
        input.status === 'removed'
          ? (item.locator.oldStart ?? 1)
          : (item.locator.newStart ?? 1)
      const changedEnd =
        input.status === 'removed'
          ? (item.locator.oldEnd ?? changedStart)
          : (item.locator.newEnd ?? changedStart)
      return {
        start: Math.max(1, changedStart - 24),
        end: Math.min(
          sourceLines.length,
          Math.min(changedEnd, changedStart + 79) + 24,
        ),
      }
    })

  return ranges.flatMap(({ start, end }) => {
    if (end < start) return []
    const text = sourceLines
      .slice(start - 1, end)
      .map((line, index) => `${start + index}: ${line}`)
      .join('\n')
      .trim()
    if (!text) return []
    const contentHash = hashContent(text)
    const locator: PersistedEvidenceLocator = {
      id: `ctx_${contentHash.slice(0, 20)}`,
      source: 'code_context',
      filePath: input.path,
      oldPath: input.oldPath,
      status: input.status,
      ...(input.status === 'removed'
        ? { oldStart: start, oldEnd: end }
        : { newStart: start, newEnd: end }),
      contentHash,
    }
    return [{ locator, maskedText: text }]
  })
}

type SourceChunk = {
  start: number
  end: number
  text: string
}

function sourceChunks(lines: string[], maxChunkCharacters = 4_500) {
  const chunks: SourceChunk[] = []
  let start = 1
  let rendered: string[] = []
  let characters = 0

  const flush = () => {
    if (rendered.length === 0) return
    chunks.push({
      start,
      end: start + rendered.length - 1,
      text: rendered.join('\n'),
    })
    start += rendered.length
    rendered = []
    characters = 0
  }

  for (const [index, rawLine] of lines.entries()) {
    const line = `${index + 1}: ${rawLine}`.slice(0, maxChunkCharacters)
    if (
      rendered.length > 0 &&
      characters + line.length + 1 > maxChunkCharacters
    ) {
      flush()
    }
    rendered.push(line)
    characters += line.length + 1
  }
  flush()
  return chunks
}

export function createSourceFileEvidence(input: {
  path: string
  oldPath?: string
  status: ChangedFileStatus
  maskedSource?: string
  diffEvidence: TransientEvidence[]
  maxCharacters: number
}): TransientEvidence[] {
  if (!input.maskedSource?.trim() || input.maxCharacters < 1_000) return []
  const chunks = sourceChunks(input.maskedSource.split('\n'))
  if (chunks.length === 0) return []

  const changedLines = input.diffEvidence.flatMap((item) => {
    const start =
      input.status === 'removed' ? item.locator.oldStart : item.locator.newStart
    const end =
      input.status === 'removed' ? item.locator.oldEnd : item.locator.newEnd
    return start ? [start, end ?? start] : []
  })
  const changedChunkIndexes = changedLines.flatMap((line) => {
    const index = chunks.findIndex(
      (chunk) => line >= chunk.start && line <= chunk.end,
    )
    return index >= 0 ? [index] : []
  })
  const sampleCount = Math.min(chunks.length, 12)
  const evenlySpacedIndexes = Array.from({ length: sampleCount }, (_, index) =>
    Math.round(
      (index * Math.max(chunks.length - 1, 0)) / Math.max(sampleCount - 1, 1),
    ),
  )
  const priority = [
    ...changedChunkIndexes,
    0,
    chunks.length - 1,
    ...evenlySpacedIndexes,
    ...chunks.map((_, index) => index),
  ]
  const selectedIndexes: number[] = []
  let characters = 0
  for (const index of priority) {
    if (selectedIndexes.includes(index)) continue
    const chunk = chunks[index]
    if (!chunk) continue
    if (
      selectedIndexes.length > 0 &&
      characters + chunk.text.length > input.maxCharacters
    ) {
      continue
    }
    selectedIndexes.push(index)
    characters += chunk.text.length
    if (characters >= input.maxCharacters) break
  }

  return selectedIndexes
    .sort((left, right) => left - right)
    .map((index) => {
      const chunk = chunks[index]!
      const contentHash = hashContent(chunk.text)
      const locator: PersistedEvidenceLocator = {
        id: `src_${contentHash.slice(0, 20)}`,
        source: 'source_file',
        filePath: input.path,
        oldPath: input.oldPath,
        status: input.status,
        ...(input.status === 'removed'
          ? { oldStart: chunk.start, oldEnd: chunk.end }
          : { newStart: chunk.start, newEnd: chunk.end }),
        contentHash,
      }
      return { locator, maskedText: chunk.text }
    })
}
