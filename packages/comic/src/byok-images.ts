import sharp from 'sharp'
import { z } from 'zod'

import {
  regenerateArtworkRequestSchema,
  type ComicAnalysis,
  type ImageProvider,
  type RegenerateArtworkRequest,
} from '@comic-code/contracts'

import { sanitizeScenePrompt } from './security'
import type { GeneratedPanelArtwork } from './types'

export type ImageProviderErrorCode =
  | 'image_provider_auth_failed'
  | 'image_provider_quota_reached'
  | 'image_provider_model_unavailable'
  | 'image_provider_rejected'
  | 'image_provider_unavailable'

export class ImageProviderError extends Error {
  constructor(
    readonly code: ImageProviderErrorCode,
    readonly provider: ImageProvider,
  ) {
    super(code)
    this.name = 'ImageProviderError'
  }
}

// Fixed official endpoints: neither keys nor model names can redirect requests.
const endpoints = {
  openai: 'https://api.openai.com/v1/images/generations',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/interactions',
} as const

const encodedImage = z
  .string()
  .min(4)
  .max(20_000_000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
const openaiResult = z.object({
  data: z
    .array(z.object({ b64_json: encodedImage }))
    .min(1)
    .max(10),
})
const geminiResult = z.object({
  status: z.literal('completed'),
  steps: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(
          z.object({
            type: z.string(),
            data: encodedImage.optional(),
            mime_type: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
})

async function boundedJson(response: Response, maxBytes = 24_000_000) {
  if (!response.body) throw new Error('empty_body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.length
      if (bytes > maxBytes) throw new Error('image_response_too_large')
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

async function generateImage(
  settings: RegenerateArtworkRequest,
  prompt: string,
  signal: AbortSignal,
) {
  const { provider, apiKey, model } = settings
  const response = await fetch(endpoints[provider], {
    method: 'POST',
    redirect: 'error',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(provider === 'openai'
        ? { Authorization: `Bearer ${apiKey}` }
        : { 'x-goog-api-key': apiKey }),
    },
    body: JSON.stringify(
      provider === 'openai'
        ? {
            model,
            prompt,
            n: 1,
            size: '1536x1024',
            quality: 'medium',
            output_format: 'png',
          }
        : {
            model,
            input: [{ type: 'text', text: prompt }],
            response_format: {
              type: 'image',
              aspect_ratio: '3:2',
              image_size: '1K',
              delivery: 'inline',
            },
            store: false,
          },
    ),
  })
  if (!response.ok) {
    // Do not echo provider bodies: they can contain keys or prompt content.
    const failure = z
      .object({
        error: z.object({
          status: z.string().optional(),
          details: z
            .array(z.object({ reason: z.string().optional() }))
            .optional(),
        }),
      })
      .safeParse(await boundedJson(response, 32_768).catch(() => null))
    const invalidGoogleKey =
      failure.success &&
      (failure.data.error.status === 'UNAUTHENTICATED' ||
        failure.data.error.details?.some(
          (detail) => detail.reason === 'API_KEY_INVALID',
        ))
    const code = invalidGoogleKey
      ? 'image_provider_auth_failed'
      : response.status === 401 || response.status === 403
        ? 'image_provider_auth_failed'
        : response.status === 429
          ? 'image_provider_quota_reached'
          : response.status === 404
            ? 'image_provider_model_unavailable'
            : response.status === 400 || response.status === 422
              ? 'image_provider_rejected'
              : 'image_provider_unavailable'
    throw new ImageProviderError(code, provider)
  }
  const payload = await boundedJson(response)
  let encoded: string | undefined
  if (provider === 'openai') {
    encoded = openaiResult.parse(payload).data[0]?.b64_json
  } else {
    // output_image is an SDK convenience; REST returns model_output steps.
    encoded = geminiResult
      .parse(payload)
      .steps.filter((step) => step.type === 'model_output')
      .flatMap((step) => step.content ?? [])
      .find(
        (part) => part.type === 'image' && part.mime_type?.startsWith('image/'),
      )?.data
  }
  if (!encoded)
    throw new ImageProviderError('image_provider_rejected', provider)
  const image = Buffer.from(encoded, 'base64')
  // Normalize raster bytes only; never fetch provider-returned image URLs.
  const raster =
    image.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ||
    image.subarray(0, 3).toString('hex') === 'ffd8ff' ||
    (image.subarray(0, 4).toString() === 'RIFF' &&
      image.subarray(8, 12).toString() === 'WEBP')
  if (!raster)
    throw new ImageProviderError('image_provider_unavailable', provider)
  const metadata = await sharp(image, {
    limitInputPixels: 40_000_000,
  }).metadata()
  if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '')) {
    throw new ImageProviderError('image_provider_unavailable', provider)
  }
  return sharp(image, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(1_536, 1_024, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer()
}

export async function generateByokPanelArtwork(
  credentials: RegenerateArtworkRequest,
  analysis: ComicAnalysis,
): Promise<GeneratedPanelArtwork[]> {
  const settings = regenerateArtworkRequestSchema.parse(credentials)
  const controller = new AbortController()
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(180_000),
  ])
  const jobs = analysis.panels.map(async (panel) => ({
    sequence: panel.sequence,
    png: await generateImage(
      settings,
      [
        sanitizeScenePrompt(analysis.sharedVisualStyle),
        sanitizeScenePrompt(panel.scenePrompt),
        `Create one distinct comic illustration for panel ${panel.sequence}: ${panel.purpose}.`,
        'Light ivory, chartreuse, blush pink, cool blue and peach editorial illustration with dark green linework. Keep the same visual style across the story.',
        'No visible text, code, letters, numbers, labels, logos, signatures, speech bubbles or watermarks. Captions are added separately.',
      ].join('\n\n'),
      signal,
    ),
  }))
  try {
    return await Promise.all(jobs)
  } catch (error) {
    controller.abort()
    await Promise.allSettled(jobs)
    if (error instanceof ImageProviderError) throw error
    throw new ImageProviderError(
      'image_provider_unavailable',
      settings.provider,
    )
  }
}
