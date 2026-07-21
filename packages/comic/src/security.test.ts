import { describe, expect, it } from 'vitest'

import {
  assertNoVerbatimEvidence,
  assertSafeGeneratedText,
  createSafetyIdentifier,
  sanitizeScenePrompt,
} from './security'

describe('createSafetyIdentifier', () => {
  it('creates a stable opaque identifier', () => {
    const first = createSafetyIdentifier('123', 'a'.repeat(32))
    const second = createSafetyIdentifier('123', 'a'.repeat(32))
    expect(first).toBe(second)
    expect(first).not.toContain('123')
  })
})

describe('generated output controls', () => {
  it('removes code and URLs from scene prompts', () => {
    expect(
      sanitizeScenePrompt(
        'Show `const token = 1` beside https://internal.test',
      ),
    ).toBe('Show beside')
  })

  it('rejects generated credentials', () => {
    expect(() => assertSafeGeneratedText('sk-proj-abcdefghijklmnop')).toThrow()
  })

  it('rejects long verbatim source lines in persisted output', () => {
    const source =
      'const customerConnection = createConnection(accountIdentifier)'
    expect(() =>
      assertNoVerbatimEvidence(`It says ${source}`, [source]),
    ).toThrow()
    expect(() =>
      assertNoVerbatimEvidence('A connection is now created.', [source]),
    ).not.toThrow()
  })
})
