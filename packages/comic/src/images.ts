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
    'Wide cinematic editorial comic illustration, clear single focal subject, strong visual storytelling, polished flat vector shapes, light ivory palette with chartreuse, blush pink, cool blue and peach surfaces, dark green linework, high contrast, generous negative space.',
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
        'Flat vector editorial illustration in a light ivory palette with chartreuse, blush pink, cool blue and peach surfaces, with dark green linework. No text, letters, numbers, labels, code, logos, signatures, speech bubbles, signs, or watermarks. Leave visual breathing room for captions that will be added separately.',
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
  const colors = [
    { paper: '#e9efcc', ink: '#607f43', soft: '#ccddaf' },
    { paper: '#f5dfe8', ink: '#a16f86', soft: '#e7bfcf' },
    { paper: '#dce9ee', ink: '#527984', soft: '#bfd5df' },
    { paper: '#f6e8d6', ink: '#a1834e', soft: '#e8d2ae' },
  ]
  return Promise.all(
    analysis.panels.map(async (panel, index) => {
      const { paper, ink, soft } = colors[index]!
      const diagrams = [
        `<rect x="310" y="190" width="620" height="540" rx="42" fill="#fff"/><rect x="366" y="270" width="205" height="22" rx="11" fill="${ink}"/><rect x="366" y="340" width="498" height="76" rx="18" fill="${paper}"/><rect x="366" y="451" width="498" height="76" rx="18" fill="${paper}"/><rect x="366" y="569" width="195" height="66" rx="33" fill="${ink}"/><path d="M974 453h240m-58-58 58 58-58 58" fill="none" stroke="${ink}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>`,
        `<rect x="354" y="210" width="827" height="514" rx="40" fill="#fff"/>${[0, 1, 2].map((n) => `<circle cx="452" cy="${320 + n * 144}" r="34" fill="${soft}"/><path d="m435 ${320 + n * 144} 12 12 23-27" stroke="${ink}" stroke-width="9" fill="none" stroke-linecap="round"/><rect x="523" y="${299 + n * 144}" width="${477 - n * 72}" height="21" rx="10" fill="${ink}"/><rect x="523" y="${337 + n * 144}" width="${300 + n * 26}" height="14" rx="7" fill="${soft}"/>`).join('')}`,
        `<rect x="327" y="180" width="300" height="447" rx="32" fill="#fff"/><rect x="380" y="240" width="196" height="24" rx="12" fill="${ink}"/><rect x="380" y="306" width="170" height="15" rx="7" fill="${soft}"/><rect x="380" y="351" width="150" height="15" rx="7" fill="${soft}"/><path d="M674 411h147m-41-41 41 41-41 41" fill="none" stroke="${ink}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>${[0, 1, 2].map((n) => `<rect x="871" y="${192 + n * 158}" width="349" height="126" rx="24" fill="#fff"/><circle cx="927" cy="${256 + n * 158}" r="18" fill="${soft}"/><rect x="971" y="${244 + n * 158}" width="185" height="17" rx="8" fill="${ink}"/>`).join('')}`,
        `<rect x="310" y="180" width="848" height="550" rx="40" fill="#fff"/><rect x="368" y="245" width="305" height="27" rx="13" fill="${ink}"/>${[0, 1, 2].map((n) => `<rect x="368" y="${330 + n * 106}" width="727" height="77" rx="17" fill="${paper}"/><rect x="394" y="${353 + n * 106}" width="240" height="12" rx="6" fill="${ink}"/><rect x="394" y="${377 + n * 106}" width="143" height="9" rx="4" fill="${soft}"/>`).join('')}<circle cx="1150" cy="213" r="90" fill="${ink}"/><path d="m1110 211 27 27 54-62" fill="none" stroke="#fff" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>`,
      ]
      const svg = Buffer.from(
        `<svg width="1536" height="1024" viewBox="0 0 1536 1024" xmlns="http://www.w3.org/2000/svg"><rect width="1536" height="1024" fill="${paper}"/><circle cx="1410" cy="60" r="335" fill="${soft}" opacity=".36"/><circle cx="80" cy="980" r="270" fill="${soft}" opacity=".25"/>${diagrams[index]}</svg>`,
      )

      return {
        sequence: panel.sequence,
        png: await sharp(svg).png().toBuffer(),
      }
    }),
  )
}
