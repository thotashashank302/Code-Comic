import { describe, expect, it } from 'vitest'

import {
  createSourceContextEvidence,
  createSourceFileEvidence,
  splitPatchIntoEvidence,
} from './evidence'
import { maskSecrets } from './secrets'

describe('maskSecrets', () => {
  it('redacts common API keys without changing ordinary diff text', () => {
    const masked = maskSecrets('+OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuv')
    expect(masked).toContain('<REDACTED_SECRET>')
    expect(maskSecrets('+const enabled = true')).toBe('+const enabled = true')
  })
})

describe('splitPatchIntoEvidence', () => {
  it('creates stable non-content locators for each hunk', () => {
    const evidence = splitPatchIntoEvidence({
      path: 'src/example.ts',
      status: 'modified',
      maskedPatch: '@@ -1,2 +1,2 @@\n-old\n+new\n same',
    })

    expect(evidence).toHaveLength(1)
    expect(evidence[0]?.locator).toMatchObject({
      source: 'diff',
      filePath: 'src/example.ts',
      oldStart: 1,
      oldEnd: 2,
      newStart: 1,
      newEnd: 2,
    })
    expect(evidence[0]?.locator).not.toHaveProperty('diffHunk')
  })

  it('adds bounded transient source context around a changed hunk', () => {
    const diffEvidence = splitPatchIntoEvidence({
      path: 'src/example.ts',
      status: 'modified',
      maskedPatch: '@@ -30,2 +30,3 @@\n-old\n+new\n+return new',
    })
    const source = Array.from(
      { length: 100 },
      (_, index) => `const line${index + 1} = ${index + 1}`,
    ).join('\n')
    const contexts = createSourceContextEvidence({
      path: 'src/example.ts',
      status: 'modified',
      maskedSource: source,
      diffEvidence,
    })

    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.locator).toMatchObject({
      source: 'code_context',
      filePath: 'src/example.ts',
      newStart: 6,
      newEnd: 56,
    })
    expect(contexts[0]?.maskedText).toContain('30: const line30 = 30')
    expect(contexts[0]?.locator).not.toHaveProperty('maskedText')
  })

  it('samples the current source file beyond the changed hunk', () => {
    const diffEvidence = splitPatchIntoEvidence({
      path: 'src/large.ts',
      status: 'modified',
      maskedPatch: '@@ -900,1 +900,1 @@\n-old\n+new',
    })
    const source = Array.from(
      { length: 2_000 },
      (_, index) => `export const line${index + 1} = ${index + 1}`,
    ).join('\n')
    const evidence = createSourceFileEvidence({
      path: 'src/large.ts',
      status: 'modified',
      maskedSource: source,
      diffEvidence,
      maxCharacters: 15_000,
    })
    const text = evidence.map((item) => item.maskedText).join('\n')

    expect(evidence.length).toBeGreaterThanOrEqual(3)
    expect(
      evidence.every((item) => item.locator.source === 'source_file'),
    ).toBe(true)
    expect(text).toContain('1: export const line1 = 1')
    expect(text).toContain('900: export const line900 = 900')
    expect(text).toContain('2000: export const line2000 = 2000')
    expect(evidence[0]?.locator).not.toHaveProperty('maskedText')
  })
})
