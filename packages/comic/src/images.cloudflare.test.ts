import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

import type { ComicAnalysis } from '@comic-code/contracts'

import {
  CloudflareArtworkError,
  generateCloudflarePanelArtwork,
} from './images'

const analysis: ComicAnalysis = {
  plainLanguageSummary: 'Local code analysis found an asynchronous code path.',
  metaphor: 'A request moving through four checkpoints.',
  sharedVisualStyle: 'Deep indigo editorial diagrams.',
  panels: [1, 2, 3, 4].map((sequence) => ({
    sequence: sequence as 1 | 2 | 3 | 4,
    purpose: (['before', 'change', 'flow', 'impact'] as const)[sequence - 1]!,
    title: `Panel ${sequence}`,
    caption: 'A grounded code explanation.',
    scenePrompt: `A distinct abstract checkpoint scene number ${sequence}.`,
    claimIds: [`claim-${sequence}`],
    confidence: 'high' as const,
    uncertaintyNote: null,
  })) as ComicAnalysis['panels'],
  claims: [1, 2, 3, 4].map((sequence) => ({
    id: `claim-${sequence}`,
    text: 'A supported code claim.',
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
      newStart: 1,
      newEnd: 8,
      contentHash: 'a'.repeat(64),
    },
  ],
  excludedFiles: [],
  generationMode: 'deterministic_fallback',
}

afterEach(() => vi.restoreAllMocks())

describe('Cloudflare BYOK artwork', () => {
  it('validates credentials and creates four distinct normalized panels', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const jpeg = await sharp({
      create: {
        width: 96,
        height: 96,
        channels: 3,
        background: '#5459ff',
      },
    })
      .jpeg()
      .toBuffer()
    const bodies: Array<{ prompt: string; seed: number }> = []
    const authorizations: Array<string | null> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).includes('/ai/models/search')) {
        return Response.json({ success: true, result: [{}] })
      }
      authorizations.push(new Headers(init?.headers).get('Authorization'))
      bodies.push(JSON.parse(String(init?.body)))
      return Response.json({
        success: true,
        result: { image: jpeg.toString('base64') },
      })
    })

    const artwork = await generateCloudflarePanelArtwork({
      accountId: 'a'.repeat(32),
      apiToken: 'token-with-workers-ai-access',
      analysis,
    })

    expect(artwork).toHaveLength(4)
    expect(authorizations).toEqual(
      Array(4).fill('Bearer token-with-workers-ai-access'),
    )
    expect(new Set(bodies.map((body) => body.seed))).toHaveLength(4)
    expect(new Set(bodies.map((body) => body.prompt))).toHaveLength(4)
    await expect(sharp(artwork[0]!.png).metadata()).resolves.toMatchObject({
      width: 1_536,
      height: 1_024,
      format: 'png',
    })
  })

  it('preserves Cloudflare status and response body for user-visible diagnostics', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json(
        { success: false, errors: [{ message: 'sensitive provider detail' }] },
        { status: 403 },
      ),
    )

    const failure = generateCloudflarePanelArtwork({
      accountId: 'a'.repeat(32),
      apiToken: 'invalid-workers-ai-token',
      analysis,
    })

    await expect(failure).rejects.toMatchObject({
      code: 'image_provider_auth_failed',
      details: {
        status: 403,
        responseBody:
          '{"success":false,"errors":[{"message":"sensitive provider detail"}]}',
      },
    } satisfies Partial<CloudflareArtworkError>)
  })
})
