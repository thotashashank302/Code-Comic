import { describe, expect, it } from 'vitest'

import {
  createDeterministicComicAnalysis,
  deterministicFallbackModels,
  isOpenAIQuotaError,
} from './fallback'

const input = {
  repository: 'owner/example',
  description: 'Untrusted repository description',
  ref: 'main',
  commitSha: 'b'.repeat(40),
  excludedFiles: ['pnpm-lock.yaml'],
  safetyIdentifier: 'safe-test-identifier',
  evidence: [
    {
      locator: {
        id: 'ev_title',
        source: 'repository_name' as const,
        contentHash: 'c'.repeat(64),
      },
      maskedText: 'Untrusted repository name',
    },
    {
      locator: {
        id: 'ev_source',
        source: 'source_file' as const,
        filePath: 'src/example.ts',
        status: 'modified' as const,
        newStart: 1,
        newEnd: 5,
        contentHash: 'd'.repeat(64),
      },
      maskedText:
        '1: export async function load() {\n2:   const response = await fetch(endpoint)\n3:   return response.json()\n4: }',
    },
  ],
}

describe('deterministic quota fallback', () => {
  it('creates a complete grounded storyboard without repeating untrusted text', () => {
    const analysis = createDeterministicComicAnalysis(input)
    const serialized = JSON.stringify(analysis)

    expect(analysis.generationMode).toBe('deterministic_fallback')
    expect(analysis.panels).toHaveLength(4)
    expect(analysis.claims).toHaveLength(4)
    expect(analysis.evidence).toHaveLength(2)
    expect(serialized).not.toContain(input.repository)
    expect(serialized).not.toContain(input.description)
    expect(serialized).not.toContain(input.evidence[1]!.maskedText)
    expect(deterministicFallbackModels.analysis).toBe(
      'deterministic-source-scan-v5',
    )
  })

  it('bounds excluded repository paths for persisted comic output', () => {
    const analysis = createDeterministicComicAnalysis({
      ...input,
      excludedFiles: Array.from(
        { length: 5_000 },
        (_, index) => `generated/file-${index}.js`,
      ),
    })

    expect(analysis.excludedFiles).toHaveLength(500)
  })

  it('explains current repository behavior without narrating code changes', () => {
    const analysis = createDeterministicComicAnalysis({
      ...input,
      evidence: [
        input.evidence[0]!,
        {
          ...input.evidence[1]!,
          maskedText: [
            '1: export async function submit(payload) {',
            '2:   const parsed = schema.safeParse(payload)',
            '3:   if (!parsed.success) throw new Error("invalid")',
            '4:   const result = await fetch(endpoint)',
            '5:   return result',
            '6: }',
          ].join('\n'),
        },
      ],
    })
    const serialized = JSON.stringify(analysis)

    expect(analysis.panels[1].caption).toMatch(
      /checks information before using it/,
    )
    expect(analysis.panels[2].caption).toMatch(
      /talks to another online service/,
    )
    expect(analysis.plainLanguageSummary).toMatch(/sampled source/)
    expect(analysis.panels.map((panel) => panel.purpose)).toEqual([
      'overview',
      'components',
      'flow',
      'outcome',
    ])
    expect(serialized.toLowerCase()).not.toContain('changed code')
    expect(serialized.toLowerCase()).not.toContain('added line')
    expect(serialized).not.toContain('schema.safeParse(payload)')
    expect(serialized).not.toContain('fetch(endpoint)')
  })

  it('falls back for exhausted quota but not ordinary rate limiting', () => {
    expect(
      isOpenAIQuotaError(
        Object.assign(new Error('You exceeded your current quota'), {
          status: 429,
          code: 'insufficient_quota',
        }),
      ),
    ).toBe(true)
    expect(
      isOpenAIQuotaError(
        Object.assign(new Error('Too many requests'), {
          status: 429,
          code: 'rate_limit_exceeded',
        }),
      ),
    ).toBe(false)
    expect(isOpenAIQuotaError(new Error('Network failed'))).toBe(false)
  })
})
