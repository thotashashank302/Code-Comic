import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import type { ComicAnalysis } from '@comic-code/contracts'

import { composeComic } from './compose'
import { createStoryboardFallbackArtwork } from './images'

const analysis: ComicAnalysis = {
  plainLanguageSummary: 'A safe sample explanation.',
  metaphor: 'A bridge gains a second lane.',
  sharedVisualStyle: 'Flat vector shapes.',
  panels: [1, 2, 3, 4].map((sequence) => ({
    sequence: sequence as 1 | 2 | 3 | 4,
    purpose: (['before', 'change', 'flow', 'impact'] as const)[sequence - 1]!,
    title: `Panel ${sequence}`,
    caption: 'A concise and grounded explanation appears here.',
    scenePrompt: 'A simple bridge scene.',
    claimIds: [`claim-${sequence}`],
    confidence: 'high' as const,
    uncertaintyNote: null,
  })) as ComicAnalysis['panels'],
  claims: [1, 2, 3, 4].map((sequence) => ({
    id: `claim-${sequence}`,
    text: 'A supported claim.',
    support: 'direct' as const,
    evidenceIds: ['evidence-1'],
    confidence: 'high' as const,
  })),
  uncertainties: [],
  evidence: [
    {
      id: 'evidence-1',
      source: 'diff',
      filePath: 'src/example.ts',
      status: 'modified',
      oldStart: 1,
      oldEnd: 2,
      newStart: 1,
      newEnd: 2,
      contentHash: 'a'.repeat(64),
    },
  ],
  excludedFiles: [],
}

describe('composeComic', () => {
  it('keeps generated artwork visible under the text overlay', async () => {
    const artwork = await sharp({
      create: {
        width: 1536,
        height: 1024,
        channels: 4,
        background: { r: 210, g: 24, b: 40, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
    const comic = await composeComic(
      analysis,
      [1, 2, 3, 4].map((sequence) => ({
        sequence: sequence as 1 | 2 | 3 | 4,
        png: artwork,
      })),
    )
    const { data, info } = await sharp(comic).raw().toBuffer({
      resolveWithObject: true,
    })
    const pixelOffset = (200 * info.width + 400) * info.channels

    expect(data[pixelOffset]).toBeGreaterThan(180)
    expect(data[pixelOffset + 1]).toBeLessThan(60)
  })

  it('keeps the text storyboard usable when image generation fails', async () => {
    const artwork = await createStoryboardFallbackArtwork(analysis)
    const comic = await composeComic(analysis, artwork)
    const metadata = await sharp(comic).metadata()

    expect(artwork).toHaveLength(4)
    expect(metadata.width).toBe(1600)
    expect(metadata.height).toBe(1200)
  })
})
