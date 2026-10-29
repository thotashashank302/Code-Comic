import { describe, expect, it } from 'vitest'
import { comicDimensions } from './comic-layout'
import { comicAnalysisSchema, createExplanationRequestSchema } from './index'

describe('four and twelve-panel contracts', () => {
  it('keeps legacy request defaults and validates explicit panel choices', () => {
    const input = {
      owner: 'owner',
      repository: 'repo',
      commitSha: 'a'.repeat(40),
    }
    expect(createExplanationRequestSchema.parse(input).panelCount).toBe(4)
    expect(
      createExplanationRequestSchema.parse({ ...input, panelCount: 12 })
        .panelCount,
    ).toBe(12)
    expect(
      createExplanationRequestSchema.safeParse({ ...input, panelCount: 8 })
        .success,
    ).toBe(false)
    expect(comicDimensions(4)).toEqual({ width: 1600, height: 1200 })
    expect(comicDimensions(12)).toEqual({ width: 1600, height: 3540 })
    expect(() => comicDimensions(8)).toThrow('invalid_panel_count')
  })

  it('rejects duplicate, missing or out-of-order persisted panels', () => {
    const panel = {
      sequence: 1,
      purpose: 'overview',
      title: 'A panel',
      caption: 'A supported idea.',
      scenePrompt: 'A workshop.',
      claimIds: ['claim-0'],
      confidence: 'medium',
      uncertaintyNote: null,
    }
    const shape = {
      plainLanguageSummary: 'A sample.',
      metaphor: 'A workshop.',
      sharedVisualStyle: 'Simple.',
      panels: Array.from({ length: 12 }, (_, index) => ({
        ...panel,
        sequence: index + 1,
      })),
      claims: Array.from({ length: 4 }, (_, index) => ({
        id: `claim-${index}`,
        text: 'A supported fact.',
        support: 'direct',
        evidenceIds: ['evidence'],
        confidence: 'medium',
      })),
      uncertainties: [],
      evidence: [
        { id: 'evidence', source: 'source_file', contentHash: 'a'.repeat(64) },
      ],
      excludedFiles: [],
    }
    expect(comicAnalysisSchema.safeParse(shape).success).toBe(true)
    expect(
      comicAnalysisSchema.safeParse({
        ...shape,
        panels: shape.panels.slice(0, 8),
      }).success,
    ).toBe(false)
    expect(
      comicAnalysisSchema.safeParse({
        ...shape,
        panels: shape.panels.map((p) => ({ ...p, sequence: 1 })),
      }).success,
    ).toBe(false)
    expect(
      comicAnalysisSchema.safeParse({
        ...shape,
        panels: [...shape.panels].reverse(),
      }).success,
    ).toBe(false)
  })
})
