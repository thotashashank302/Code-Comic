import { describe, expect, it } from 'vitest'
import { getSampleExplanation } from '../../comic/src/sample'
import { panelPrompts, validateArtworkFile } from './artwork'

describe('manual artwork preparation', () => {
  it.each([4, 12] as const)(
    'exports %i distinct, contextual prompts without any provider request',
    (count) => {
      const analysis = getSampleExplanation(count).analysis
      const prompts = panelPrompts(analysis)
      expect(prompts).toHaveLength(count)
      expect(new Set(prompts.map((panel) => panel.prompt)).size).toBe(count)
      prompts.forEach((panel, index) => {
        expect(panel.sequence).toBe(index + 1)
        expect(panel.prompt).toContain(analysis.panels[index]!.scenePrompt)
        expect(panel.prompt).toContain(analysis.plainLanguageSummary)
        expect(panel.prompt).toContain('Return one image, not a comic grid.')
        expect(panel.prompt).not.toContain('API key')
      })
    },
  )

  it('accepts bounded raster files and rejects SVG, empty or oversized uploads', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(() => validateArtworkFile({ type, size: 1024 })).not.toThrow()
    }
    expect(() =>
      validateArtworkFile({ type: 'image/svg+xml', size: 100 }),
    ).toThrow(/PNG, JPEG or WebP/)
    expect(() => validateArtworkFile({ type: 'image/png', size: 0 })).toThrow(
      /non-empty/,
    )
    expect(() =>
      validateArtworkFile({ type: 'image/png', size: 8 * 1024 * 1024 + 1 }),
    ).toThrow(/8 MB/)
  })
})
