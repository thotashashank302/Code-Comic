import {
  claimVerificationBatchSchema,
  comicAnalysisDraftSchema,
} from '@comic-code/contracts'
import { z } from 'zod'

import {
  buildVerifiedComicAnalysis,
  comicAnalysisOutputSchema,
  validateComicAnalysisDraft,
} from './analyze'
import { CloudflareArtworkError, cloudflareFetch } from './images'
import { storyboardInstructions, verificationInstructions } from './prompts'
import type { AnalysisInput } from './types'

export const cloudflareAnalysisModel =
  '@cf/meta/llama-3.1-8b-instruct-fast' as const

type CloudflareUsage = {
  inputTokens: number
  outputTokens: number
}

function responseFormat(schema: z.ZodType) {
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<
    string,
    unknown
  >
  delete jsonSchema.$schema
  return {
    type: 'json_schema',
    json_schema: jsonSchema,
  }
}

function boundedEvidence(input: AnalysisInput) {
  const priority = { source_file: 0, code_context: 1, diff: 1 } as const
  const evidence = [...input.evidence].sort((left, right) => {
    const leftPriority =
      left.locator.source in priority
        ? priority[left.locator.source as keyof typeof priority]
        : 2
    const rightPriority =
      right.locator.source in priority
        ? priority[right.locator.source as keyof typeof priority]
        : 2
    return leftPriority - rightPriority
  })
  let remainingCharacters = 96_000

  return evidence.flatMap(({ locator, maskedText }) => {
    if (remainingCharacters <= 0) return []
    const quotedData = maskedText.slice(
      0,
      Math.min(16_000, remainingCharacters),
    )
    remainingCharacters -= quotedData.length
    return [
      {
        id: locator.id,
        source: locator.source,
        filePath: locator.filePath,
        oldStart: locator.oldStart,
        oldEnd: locator.oldEnd,
        newStart: locator.newStart,
        newEnd: locator.newEnd,
        quotedData,
      },
    ]
  })
}

function pullRequestEvidence(input: AnalysisInput) {
  return {
    pullRequest: {
      title: input.title.slice(0, 600),
      description: input.description.slice(0, 4_000),
    },
    evidence: boundedEvidence(input),
    excludedFiles: input.excludedFiles,
  }
}

function extractJson(value: unknown) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') {
    throw new CloudflareArtworkError('cloudflare_analysis_failed')
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    const start = value.indexOf('{')
    const end = value.lastIndexOf('}')
    if (start < 0 || end <= start) {
      throw new CloudflareArtworkError('cloudflare_analysis_failed')
    }
    try {
      return JSON.parse(value.slice(start, end + 1)) as unknown
    } catch {
      throw new CloudflareArtworkError('cloudflare_analysis_failed')
    }
  }
}

async function runCloudflareJson(input: {
  accountId: string
  apiToken: string
  instructions: string
  userInput: unknown
  format: ReturnType<typeof responseFormat>
}) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/run/${cloudflareAnalysisModel}`
  const request = async (
    format: ReturnType<typeof responseFormat> | { type: 'json_object' },
    instructions: string,
  ) => {
    const response = await cloudflareFetch(
      endpoint,
      input.apiToken,
      {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: JSON.stringify(input.userInput) },
          ],
          response_format: format,
          max_tokens: 4_096,
          temperature: 0.2,
        }),
      },
      'cloudflare_analysis_failed',
    )
    const responseBody = await response.text()
    const payload = (() => {
      try {
        return JSON.parse(responseBody) as {
          success?: boolean
          result?: {
            response?: unknown
            usage?: {
              prompt_tokens?: number
              completion_tokens?: number
            }
          }
        }
      } catch {
        return null
      }
    })() as {
      success?: boolean
      result?: {
        response?: unknown
        usage?: {
          prompt_tokens?: number
          completion_tokens?: number
        }
      }
    } | null
    if (!payload?.success || payload.result?.response === undefined) {
      throw new CloudflareArtworkError('cloudflare_analysis_failed', {
        endpoint,
        model: cloudflareAnalysisModel,
        status: response.status,
        statusText: response.statusText,
        responseBody: responseBody.slice(0, 4_000),
        requestId:
          response.headers.get('cf-ray') ??
          response.headers.get('x-request-id') ??
          undefined,
      })
    }

    return {
      value: extractJson(payload.result.response),
      usage: {
        inputTokens: payload.result.usage?.prompt_tokens ?? 0,
        outputTokens: payload.result.usage?.completion_tokens ?? 0,
      } satisfies CloudflareUsage,
    }
  }

  try {
    return await request(input.format, input.instructions)
  } catch (error) {
    if (
      !(error instanceof CloudflareArtworkError) ||
      error.code !== 'cloudflare_analysis_failed'
    ) {
      throw error
    }
    return request(
      { type: 'json_object' },
      `${input.instructions}\nReturn only one valid JSON object matching this schema: ${JSON.stringify(input.format.json_schema)}`,
    )
  }
}

export async function analyzeCloudflareComic(
  input: AnalysisInput,
  credentials: { accountId: string; apiToken: string },
) {
  const evidence = pullRequestEvidence(input)
  try {
    const generated = await runCloudflareJson({
      ...credentials,
      instructions: `${storyboardInstructions}\n\nSource-file evidence contains bounded sections from selected files at the pull request head. Explain how that code operates as one system. Ground every explanation in cited source evidence.`,
      userInput: evidence,
      format: responseFormat(comicAnalysisOutputSchema),
    })
    const draft = comicAnalysisDraftSchema.parse(generated.value)
    validateComicAnalysisDraft(
      draft,
      new Set(input.evidence.map((item) => item.locator.id)),
      input.evidence.map((item) => item.maskedText),
    )

    const verified = await runCloudflareJson({
      ...credentials,
      instructions: verificationInstructions,
      userInput: { evidence, claims: draft.claims },
      format: responseFormat(claimVerificationBatchSchema),
    })
    const verification = claimVerificationBatchSchema.parse(verified.value)
    const analysis = buildVerifiedComicAnalysis({
      analysisInput: input,
      draft,
      verification,
      generationMode: 'cloudflare_byok',
    })

    return {
      analysis,
      usage: {
        analysis: generated.usage,
        verification: verified.usage,
      },
    }
  } catch (error) {
    if (error instanceof CloudflareArtworkError) throw error
    throw new CloudflareArtworkError('cloudflare_analysis_failed')
  }
}
