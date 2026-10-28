import { describe, expect, it } from 'vitest'
import { comicAnalysisSchema } from '@comic-code/contracts'
import { sampleAnalysis, sampleRepository, sampleExplanation } from './sample'

describe('bundled sample', () => {
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
