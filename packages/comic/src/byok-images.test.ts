import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

import { regenerateArtworkRequestSchema } from '@comic-code/contracts'
import { sampleAnalysis, sampleDetailedAnalysis } from './sample'
import { generateByokPanelArtwork } from './byok-images'

const secret = 'dummy-image-api-key-no-real-access'
const image = () =>
  sharp({
    create: { width: 64, height: 64, channels: 3, background: '#d8e8bb' },
  })
    .jpeg()
    .toBuffer()

afterEach(() => vi.restoreAllMocks())

describe('image provider BYOK', () => {
  it('generates twelve ordered panels with at most three provider requests in flight', async () => {
    const encoded = (await image()).toString('base64')
    let inFlight = 0
    let peak = 0
    const upstream = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight--
        return Response.json({ data: [{ b64_json: encoded }] })
      })
    const artwork = await generateByokPanelArtwork(
      regenerateArtworkRequestSchema.parse({
        provider: 'openai',
        apiKey: secret,
      }),
      sampleDetailedAnalysis,
    )
    expect(upstream).toHaveBeenCalledTimes(12)
    expect(peak).toBeLessThanOrEqual(3)
    expect(artwork.map((panel) => panel.sequence)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    )
  })
  it.each(['openai', 'gemini'] as const)(
    'generates and normalizes four distinct %s panels with only the chosen key',
    async (provider) => {
      const encoded = (await image()).toString('base64')
      const upstream = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () =>
          Response.json(
            provider === 'openai'
              ? { data: [{ b64_json: encoded }] }
              : {
                  status: 'completed',
                  steps: [
                    {
                      type: 'thought',
                      content: [
                        {
                          type: 'image',
                          mime_type: 'image/jpeg',
                          data: 'bm90LWFuLWltYWdl',
                        },
                      ],
                    },
                    {
                      type: 'model_output',
                      content: [
                        { type: 'text', text: 'A panel.' },
                        {
                          type: 'image',
                          mime_type: 'image/jpeg',
                          data: encoded,
                        },
                      ],
                    },
                  ],
                },
          ),
        )
      const credentials = regenerateArtworkRequestSchema.parse({
        provider,
        apiKey: secret,
      })
      const artwork = await generateByokPanelArtwork(
        credentials,
        sampleAnalysis,
      )
      expect(artwork.map((panel) => panel.sequence)).toEqual([1, 2, 3, 4])
      expect(upstream).toHaveBeenCalledTimes(4)
      const bodies = upstream.mock.calls.map(([, init]) =>
        JSON.parse(String(init?.body)),
      )
      expect(new Set(bodies.map((body) => JSON.stringify(body)))).toHaveLength(
        4,
      )
      for (const [url, init] of upstream.mock.calls) {
        const headers = new Headers(init?.headers)
        expect(init?.redirect).toBe('error')
        expect(String(init?.body)).not.toContain(secret)
        expect(String(init?.body)).not.toContain('sample-form')
        if (provider === 'openai') {
          expect(String(url)).toBe(
            'https://api.openai.com/v1/images/generations',
          )
          expect(headers.get('Authorization')).toBe(`Bearer ${secret}`)
          expect(headers.has('x-goog-api-key')).toBe(false)
          expect(JSON.parse(String(init?.body))).toMatchObject({
            model: 'gpt-image-2',
            n: 1,
            output_format: 'png',
          })
        } else {
          expect(String(url)).toBe(
            'https://generativelanguage.googleapis.com/v1beta/interactions',
          )
          expect(headers.get('x-goog-api-key')).toBe(secret)
          expect(headers.has('Authorization')).toBe(false)
          expect(JSON.parse(String(init?.body))).toMatchObject({
            model: 'gemini-nano-banana-2.1',
            store: false,
            response_format: { type: 'image', delivery: 'inline' },
          })
        }
      }
      for (const panel of artwork) {
        expect(await sharp(panel.png).metadata()).toMatchObject({
          width: 1536,
          height: 1024,
          format: 'png',
        })
      }
    },
  )

  it.each([
    [401, 'image_provider_auth_failed'],
    [403, 'image_provider_auth_failed'],
    [429, 'image_provider_quota_reached'],
    [404, 'image_provider_model_unavailable'],
    [400, 'image_provider_rejected'],
    [503, 'image_provider_unavailable'],
  ])(
    'classifies HTTP %i without exposing upstream secrets or retrying',
    async (status, code) => {
      const upstream = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(
          async () => new Response(`Rejected ${secret}`, { status }),
        )
      const failure = await generateByokPanelArtwork(
        regenerateArtworkRequestSchema.parse({
          provider: 'openai',
          apiKey: secret,
        }),
        sampleAnalysis,
      ).catch((error: unknown) => error)
      expect(failure).toMatchObject({ code, provider: 'openai' })
      expect(JSON.stringify(failure)).not.toContain(secret)
      expect(upstream).toHaveBeenCalledTimes(3)
      expect(
        upstream.mock.calls.every(([, init]) => init?.signal?.aborted),
      ).toBe(true)
    },
  )

  it.each([
    { data: [{ url: 'http://169.254.169.254/private' }] },
    {
      data: [
        {
          b64_json: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"/>',
          ).toString('base64'),
        },
      ],
    },
    { data: [] },
  ])(
    'rejects non-raster, empty and URL-only outputs without following URLs',
    async (payload) => {
      const upstream = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => Response.json(payload))
      await expect(
        generateByokPanelArtwork(
          regenerateArtworkRequestSchema.parse({
            provider: 'openai',
            apiKey: secret,
          }),
          sampleAnalysis,
        ),
      ).rejects.toMatchObject({ code: 'image_provider_unavailable' })
      expect(
        upstream.mock.calls.every(
          ([url]) =>
            String(url) === 'https://api.openai.com/v1/images/generations',
        ),
      ).toBe(true)
    },
  )

  it('does not treat a Gemini thought image as a final illustration', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({
        status: 'completed',
        steps: [
          {
            type: 'thought',
            content: [
              {
                type: 'image',
                mime_type: 'image/png',
                data: 'bm90LWFuLWltYWdl',
              },
            ],
          },
        ],
      }),
    )
    await expect(
      generateByokPanelArtwork(
        regenerateArtworkRequestSchema.parse({
          provider: 'gemini',
          apiKey: secret,
        }),
        sampleAnalysis,
      ),
    ).rejects.toMatchObject({ code: 'image_provider_rejected' })
  })

  it('recognizes Gemini API_KEY_INVALID even when Google returns HTTP 400', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json(
        {
          error: {
            status: 'INVALID_ARGUMENT',
            message: secret,
            details: [{ reason: 'API_KEY_INVALID' }],
          },
        },
        { status: 400 },
      ),
    )
    await expect(
      generateByokPanelArtwork(
        regenerateArtworkRequestSchema.parse({
          provider: 'gemini',
          apiKey: secret,
        }),
        sampleAnalysis,
      ),
    ).rejects.toMatchObject({ code: 'image_provider_auth_failed' })
  })

  it('rejects oversized JSON responses before decoding image data', async () => {
    const canceled = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(24_000_001))
            },
            cancel: canceled,
          }),
        ),
    )
    await expect(
      generateByokPanelArtwork(
        regenerateArtworkRequestSchema.parse({
          provider: 'openai',
          apiKey: secret,
        }),
        sampleAnalysis,
      ),
    ).rejects.toMatchObject({ code: 'image_provider_unavailable' })
    expect(canceled).toHaveBeenCalledTimes(3)
  })

  it('rejects cross-provider models, arbitrary endpoints, retired credentials and empty keys before any call', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch')
    for (const payload of [
      { provider: 'cloudflare', accountId: 'a'.repeat(32), apiToken: secret },
      { provider: 'openai', apiKey: secret, model: 'gemini-nano-banana-2.1' },
      { provider: 'gemini', apiKey: secret, model: 'gpt-image-2' },
      { provider: 'openai', apiKey: secret, baseUrl: 'http://localhost:1234' },
      { provider: 'openai', apiKey: '' },
    ])
      expect(regenerateArtworkRequestSchema.safeParse(payload).success).toBe(
        false,
      )
    expect(upstream).not.toHaveBeenCalled()
  })
})
