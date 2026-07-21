import { createHash } from 'node:crypto'

import { z } from 'zod'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import sharp from 'sharp'

import type { ComicAnalysis } from '@comic-code/contracts'

import type { GeneratedPanelArtwork } from './types'

export const cloudflareImageModel =
  '@cf/black-forest-labs/flux-1-schnell' as const

export type CloudflareErrorCode =
  | 'image_provider_auth_failed'
  | 'image_provider_quota_reached'
  | 'image_provider_unavailable'
  | 'cloudflare_analysis_failed'

export type CloudflareErrorDetails = {
  endpoint?: string
  model?: string
  status?: number
  statusText?: string
  responseBody?: string
  requestId?: string
}

export class CloudflareArtworkError extends Error {
  constructor(
    public readonly code: CloudflareErrorCode,
    public readonly details: CloudflareErrorDetails = {},
  ) {
    super(code)
    this.name = 'CloudflareArtworkError'
  }
}

function cloudflareErrorForStatus(
  status: number,
  unavailableCode: CloudflareErrorCode,
  details: CloudflareErrorDetails,
) {
  if (status === 401 || status === 403) {
    return new CloudflareArtworkError('image_provider_auth_failed', details)
  }
  if (status === 429) {
    return new CloudflareArtworkError('image_provider_quota_reached', details)
  }
  return new CloudflareArtworkError(unavailableCode, details)
}

function cloudflareModel(url: string) {
  const marker = '/ai/run/'
  const index = url.indexOf(marker)
  return index < 0
    ? undefined
    : decodeURIComponent(url.slice(index + marker.length))
}

function safeProviderBody(body: string, apiToken: string) {
  return body.replaceAll(apiToken, '[REDACTED]').slice(0, 4_000)
}

export function cloudflareErrorMessage(error: CloudflareArtworkError) {
  const { model, responseBody, status, statusText } = error.details
  const statusLabel = status
    ? `${status}${statusText ? ` ${statusText}` : ''}`
    : 'request failed'
  const modelLabel = model ? ` for ${model}` : ''
  return `Cloudflare Workers AI ${statusLabel}${modelLabel}: ${responseBody?.trim() || error.code}`.slice(
    0,
    4_000,
  )
}

export async function cloudflareFetch(
  url: string,
  apiToken: string,
  init?: RequestInit,
  unavailableCode: CloudflareErrorCode = 'image_provider_unavailable',
) {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${apiToken}`)
  headers.set('Content-Type', 'application/json')
  const model = cloudflareModel(url)
  const tokenFingerprint = createHash('sha256')
    .update(apiToken)
    .digest('hex')
    .slice(0, 12)
  const requestDetails = {
    url,
    method: init?.method ?? 'GET',
    model,
    headers: {
      Authorization: 'Bearer [REDACTED]',
      'Content-Type': headers.get('Content-Type'),
    },
    tokenFingerprint,
    tokenLength: apiToken.length,
    bodyBytes:
      typeof init?.body === 'string' ? Buffer.byteLength(init.body) : undefined,
  }
  console.info('Cloudflare Workers AI request', requestDetails)

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(60_000),
    })
  } catch (error) {
    console.error('Cloudflare Workers AI network failure', {
      ...requestDetails,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'unknown',
    })
    throw new CloudflareArtworkError(unavailableCode, {
      endpoint: url,
      model,
      responseBody:
        error instanceof Error
          ? error.message.slice(0, 4_000)
          : 'Network failure',
    })
  }
  const requestId =
    response.headers.get('cf-ray') ??
    response.headers.get('x-request-id') ??
    undefined
  if (!response.ok) {
    const responseBody = safeProviderBody(await response.text(), apiToken)
    const details = {
      endpoint: url,
      model,
      status: response.status,
      statusText: response.statusText,
      responseBody,
      requestId,
    }
    console.error('Cloudflare Workers AI response', details)
    throw cloudflareErrorForStatus(response.status, unavailableCode, details)
  }
  console.info('Cloudflare Workers AI response', {
    url,
    model,
    status: response.status,
    statusText: response.statusText,
    requestId,
  })
  return response
}

function cloudflarePanelPrompt(
  analysis: ComicAnalysis,
  panel: ComicAnalysis['panels'][number],
) {
  return [
    analysis.sharedVisualStyle,
    panel.scenePrompt,
    `Panel ${panel.sequence} purpose: ${panel.purpose}.`,
    'Wide cinematic editorial comic illustration, clear single focal subject, strong visual storytelling, polished flat vector shapes, deep indigo and near-black palette, violet-blue glow, one sparse amber accent, high contrast, generous negative space.',
    'No visible text, letters, numbers, code, labels, logos, signatures, speech bubbles, signs, UI screenshots, or watermarks.',
  ]
    .join('\n\n')
    .slice(0, 2_048)
}

function imageFromCloudflarePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const result =
    record.result && typeof record.result === 'object'
      ? (record.result as Record<string, unknown>)
      : record
  return typeof result.image === 'string' ? result.image : null
}

export async function generateCloudflarePanelArtwork(input: {
  accountId: string
  apiToken: string
  analysis: ComicAnalysis
}): Promise<GeneratedPanelArtwork[]> {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/run/${cloudflareImageModel}`
  const seedBase = Math.floor(Math.random() * 900_000_000) + 1

  return Promise.all(
    input.analysis.panels.map(async (panel) => {
      const response = await cloudflareFetch(endpoint, input.apiToken, {
        method: 'POST',
        body: JSON.stringify({
          prompt: cloudflarePanelPrompt(input.analysis, panel),
          steps: 8,
          seed: seedBase + panel.sequence * 9_973,
        }),
      })
      const contentType = response.headers.get('content-type') ?? ''
      let image: Buffer
      if (contentType.startsWith('image/')) {
        image = Buffer.from(await response.arrayBuffer())
      } else {
        const responseBody = await response.text()
        const payload = (() => {
          try {
            return JSON.parse(responseBody) as unknown
          } catch {
            return null
          }
        })()
        const encoded = imageFromCloudflarePayload(payload)
        if (!encoded) {
          throw new CloudflareArtworkError('image_provider_unavailable', {
            endpoint,
            model: cloudflareImageModel,
            status: response.status,
            statusText: response.statusText,
            responseBody: responseBody.slice(0, 4_000),
            requestId:
              response.headers.get('cf-ray') ??
              response.headers.get('x-request-id') ??
              undefined,
          })
        }
        image = Buffer.from(encoded, 'base64')
      }
      if (image.byteLength === 0 || image.byteLength > 15 * 1_024 * 1_024) {
        throw new CloudflareArtworkError('image_provider_unavailable')
      }

      try {
        return {
          sequence: panel.sequence,
          png: await sharp(image, { limitInputPixels: 40_000_000 })
            .rotate()
            .resize(1_536, 1_024, { fit: 'cover', position: 'attention' })
            .png()
            .toBuffer(),
        }
      } catch {
        throw new CloudflareArtworkError('image_provider_unavailable')
      }
    }),
  )
}

const imageTextCheckSchema = z.object({
  hasUnwantedText: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  detectedText: z.array(z.string().max(100)).max(20),
})

async function assertArtworkHasNoText(input: {
  openai: OpenAI
  model: string
  safetyIdentifier: string
  png: Buffer
}) {
  const response = await input.openai.responses.parse({
    model: input.model,
    store: false,
    safety_identifier: input.safetyIdentifier,
    instructions:
      'Inspect the image for visible letters, numbers, words, code, labels, logos, signatures, or watermarks. Do not interpret the scene. Return only the structured inspection.',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Check this generated comic artwork.' },
          {
            type: 'input_image',
            image_url: `data:image/png;base64,${input.png.toString('base64')}`,
            detail: 'low',
          },
        ],
      },
    ],
    text: {
      format: zodTextFormat(imageTextCheckSchema, 'image_text_check'),
    },
  })
  const check = response.output_parsed
  if (!check) throw new Error('Artwork text inspection returned no result')
  if (check.hasUnwantedText && check.confidence !== 'low') {
    throw new Error('Generated artwork contains unwanted visible text')
  }
}

export async function generatePanelArtwork(input: {
  apiKey: string
  analysisModel?: string
  imageModel?: string
  safetyIdentifier: string
  analysis: ComicAnalysis
}): Promise<GeneratedPanelArtwork[]> {
  const openai = new OpenAI({ apiKey: input.apiKey })
  const imageModel = input.imageModel ?? 'gpt-image-2'
  const analysisModel = input.analysisModel ?? 'gpt-5.6-terra'

  return Promise.all(
    input.analysis.panels.map(async (panel) => {
      const prompt = [
        input.analysis.sharedVisualStyle,
        panel.scenePrompt,
        'Flat vector editorial illustration in a deep indigo and near-black palette, with violet-blue glow and one sparse amber accent. No text, letters, numbers, labels, code, logos, signatures, speech bubbles, signs, or watermarks. Leave visual breathing room for captions that will be added separately.',
      ].join('\n\n')
      const response = await openai.images.generate({
        model: imageModel,
        prompt,
        size: '1536x1024',
        quality: 'medium',
        output_format: 'png',
      })
      const encoded = response.data?.[0]?.b64_json
      if (!encoded)
        throw new Error(`No artwork returned for panel ${panel.sequence}`)
      const png = Buffer.from(encoded, 'base64')

      await assertArtworkHasNoText({
        openai,
        model: analysisModel,
        safetyIdentifier: input.safetyIdentifier,
        png,
      })

      return { sequence: panel.sequence, png }
    }),
  )
}

export async function createStoryboardFallbackArtwork(
  analysis: ComicAnalysis,
): Promise<GeneratedPanelArtwork[]> {
  const accents = ['#5459ff', '#a13cff', '#2f88ff', '#ffb53e']

  return Promise.all(
    analysis.panels.map(async (panel, index) => {
      const accent = accents[index]!
      const nextAccent = accents[(index + 1) % accents.length]!
      const svg = Buffer.from(`
        <svg width="1536" height="1024" viewBox="0 0 1536 1024" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="glow" cx="50%" cy="45%" r="58%">
              <stop offset="0%" stop-color="${accent}" stop-opacity="0.72" />
              <stop offset="58%" stop-color="#11116d" stop-opacity="0.36" />
              <stop offset="100%" stop-color="#05050d" stop-opacity="0" />
            </radialGradient>
            <linearGradient id="line" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="${accent}" />
              <stop offset="100%" stop-color="${nextAccent}" />
            </linearGradient>
          </defs>
          <rect width="1536" height="1024" fill="#05050d" />
          <ellipse cx="768" cy="470" rx="620" ry="430" fill="url(#glow)" />
          <g fill="none" stroke="url(#line)" stroke-width="12" stroke-linecap="round" opacity="0.9">
            <path d="M190 650 C430 300 640 770 850 410 S1190 310 1360 590" />
            <path d="M210 740 C480 440 650 860 920 530 S1220 430 1340 680" opacity="0.44" />
          </g>
          <g fill="${accent}">
            <circle cx="190" cy="650" r="24" />
            <circle cx="850" cy="410" r="32" />
            <circle cx="1360" cy="590" r="24" />
          </g>
          <circle cx="768" cy="470" r="122" fill="#080814" stroke="${nextAccent}" stroke-width="10" />
          <path d="M708 470 L753 515 L842 418" fill="none" stroke="#ffffff" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      `)

      return {
        sequence: panel.sequence,
        png: await sharp(svg).png().toBuffer(),
      }
    }),
  )
}
