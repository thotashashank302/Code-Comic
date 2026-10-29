import { describe, expect, it } from 'vitest'
import { comicAnalysisSchema } from '@comic-code/contracts'
import {
  sampleAnalysis,
  sampleRepository,
  sampleExplanation,
  getSampleExplanation,
} from './sample'

describe('bundled sample', () => {
  it('provides twelve distinct illustrative story beats with valid evidence references', () => {
    const sample = getSampleExplanation(12)
    const analysis = comicAnalysisSchema.parse(sample.analysis)
    expect(analysis.panels).toHaveLength(12)
    expect(new Set(analysis.panels.map((panel) => panel.caption)).size).toBe(12)
    const claims = new Map(analysis.claims.map((claim) => [claim.id, claim]))
    const evidence = new Set(analysis.evidence.map((item) => item.id))
    for (const panel of analysis.panels) {
      expect(panel.claimIds.every((id) => claims.has(id))).toBe(true)
    }
    expect(
      analysis.claims.every((claim) =>
        claim.evidenceIds.every((id) => evidence.has(id)),
      ),
    ).toBe(true)
    expect(sample.artifactUrl).toBe('/sample-comic-12.png')
  })
  it('remains a valid four-panel explanation with traceable illustrative evidence', () => {
    const analysis = comicAnalysisSchema.parse(sampleAnalysis)
    expect(analysis.panels).toHaveLength(4)
    const evidence = new Set(analysis.evidence.map((item) => item.id))
    for (const claim of analysis.claims)
      expect(claim.evidenceIds.every((id) => evidence.has(id))).toBe(true)
    expect(sampleExplanation.status).toBe('completed')
    expect(sampleRepository.representativeFiles).toHaveLength(4)
    expect(analysis.uncertainties.join(' ')).toMatch(
      /not a live repository analysis/,
    )
  })
})
