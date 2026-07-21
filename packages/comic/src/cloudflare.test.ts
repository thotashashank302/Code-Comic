import { afterEach, describe, expect, it, vi } from 'vitest'

import { analyzeCloudflareComic, cloudflareAnalysisModel } from './cloudflare'

afterEach(() => vi.restoreAllMocks())

describe('Cloudflare BYOK code analysis', () => {
  it('analyzes and verifies transient code before returning a grounded story', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const claimIds = ['claim-1', 'claim-2', 'claim-3', 'claim-4']
    const draft = {
      plainLanguageSummary:
        'The handler validates an incoming value before completing its asynchronous request.',
      metaphor: 'A parcel passes through four guarded checkpoints.',
      sharedVisualStyle:
        'Flat vector editorial scenes in deep indigo with amber checkpoints.',
      panels: claimIds.map((claimId, index) => ({
        sequence: index + 1,
        purpose: ['overview', 'components', 'flow', 'outcome'][index],
        title: ['Arrival', 'Validation', 'Request', 'Outcome'][index],
        caption: [
          'An incoming value reaches a guarded handler.',
          'A validation gate rejects malformed input.',
          'Accepted input continues through an asynchronous request.',
          'Failures stop safely while valid work reaches completion.',
        ][index],
        scenePrompt: `An abstract checkpoint scene ${index + 1} with no text.`,
        claimIds: [claimId],
        confidence: 'high',
        uncertaintyNote: null,
      })),
      claims: claimIds.map((id, index) => ({
        id,
        text: [
          'The handler receives input.',
          'The handler validates input.',
          'Valid input reaches asynchronous work.',
          'Invalid input follows an error path.',
        ][index],
        support: 'direct',
        evidenceIds: ['ev_source'],
        confidence: 'high',
      })),
      uncertainties: [],
    }
    const verification = {
      results: claimIds.map((claimId) => ({
        claimId,
        verdict: 'direct',
        reason: 'The cited source lines demonstrate this behavior.',
      })),
    }
    const requests: Array<Record<string, unknown>> = []
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)))
        return Response.json({
          success: true,
          result: {
            response: draft,
            usage: { prompt_tokens: 120, completion_tokens: 80 },
          },
        })
      })
      .mockImplementationOnce(async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)))
        return Response.json({
          success: true,
          result: {
            response: verification,
            usage: { prompt_tokens: 60, completion_tokens: 20 },
          },
        })
      })

    const result = await analyzeCloudflareComic(
      {
        title: 'Validate the handler',
        description: '',
        baseSha: 'a'.repeat(40),
        headSha: 'b'.repeat(40),
        excludedFiles: [],
        safetyIdentifier: 'safe-user',
        evidence: [
          {
            locator: {
              id: 'ev_source',
              source: 'source_file',
              filePath: 'src/handler.ts',
              status: 'modified',
              newStart: 1,
              newEnd: 4,
              contentHash: 'c'.repeat(64),
            },
            maskedText:
              '1: export async function handle(input) {\n2: const valid = schema.safeParse(input)\n3: if (!valid.success) throw new Error()\n4: await send(valid.data)\n5: }',
          },
        ],
      },
      {
        accountId: 'd'.repeat(32),
        apiToken: 'workers-ai-secret-token',
      },
    )

    expect(result.analysis.generationMode).toBe('cloudflare_byok')
    expect(result.analysis.panels).toHaveLength(4)
    expect(result.analysis.evidence[0]?.source).toBe('source_file')
    expect(JSON.stringify(result.analysis)).not.toContain('schema.safeParse')
    expect(result.usage).toEqual({
      analysis: { inputTokens: 120, outputTokens: 80 },
      verification: { inputTokens: 60, outputTokens: 20 },
    })
    expect(requests).toHaveLength(2)
    expect(requests[0]?.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { type: 'object' },
    })
    expect(JSON.stringify(requests)).not.toContain('workers-ai-secret-token')
    expect(cloudflareAnalysisModel).toBe('@cf/meta/llama-3.1-8b-instruct-fast')
  })
})
