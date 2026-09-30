import {
  claimVerificationBatchSchema,
  comicAnalysisDraftSchema,
  maxPersistedExcludedFiles,
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
  '@cf/meta/llama-4-scout-17b-16e-instruct' as const

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
  const priority = {
    readme: 0,
    manifest: 0,
    source_file: 0,
    code_context: 1,
    directory_structure: 1,
    diff: 2,
  } as const
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
  let remainingCharacters = 48_000

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

function repositoryEvidence(input: AnalysisInput) {
  return {
    repository: {
      name: input.repository.slice(0, 240),
      description: input.description.slice(0, 4_000),
      ref: input.ref.slice(0, 255),
      commitSha: input.commitSha,
    },
    evidence: boundedEvidence(input),
    excludedFiles: input.excludedFiles.slice(0, maxPersistedExcludedFiles),
  }
}

function extractJson(value: unknown) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') {
    throw new CloudflareArtworkError('cloudflare_analysis_failed', {
      model: cloudflareAnalysisModel,
      responseBody: `Workers AI returned ${typeof value}, not JSON.`,
    })
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    const start = value.indexOf('{')
    const end = value.lastIndexOf('}')
    if (start < 0 || end <= start) {
      throw new CloudflareArtworkError('cloudflare_analysis_failed', {
        model: cloudflareAnalysisModel,
        responseBody: `Workers AI returned malformed JSON (${value.length} characters; object boundaries missing).`,
      })
    }
    try {
      return JSON.parse(value.slice(start, end + 1)) as unknown
    } catch {
      throw new CloudflareArtworkError('cloudflare_analysis_failed', {
        model: cloudflareAnalysisModel,
        responseBody: `Workers AI returned malformed JSON (${value.length} characters).`,
      })
    }
  }
}

function isCloudflareAnalysisFailure(error: unknown) {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'cloudflare_analysis_failed'
  )
}

function cloudflareAnalysisDiagnostic(
  stage: 'draft_schema' | 'draft_validation' | 'verification_schema',
  detail: unknown,
) {
  const responseBody =
    typeof detail === 'string'
      ? detail
      : JSON.stringify(detail, null, 2).slice(0, 4_000)
  return new CloudflareArtworkError('cloudflare_analysis_failed', {
    model: cloudflareAnalysisModel,
    responseBody: `${stage}: ${responseBody}`.slice(0, 4_000),
  })
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
    if (!isCloudflareAnalysisFailure(error)) throw error
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
  const evidence = repositoryEvidence(input)
  try {
    const validEvidenceIds = new Set(
      input.evidence.map((item) => item.locator.id),
    )
    const evidenceText = input.evidence.map((item) => item.maskedText)
    let generatedUsage: CloudflareUsage = { inputTokens: 0, outputTokens: 0 }
    let draft: z.infer<typeof comicAnalysisDraftSchema> | undefined
    let rejectedDraft: z.infer<typeof comicAnalysisDraftSchema> | undefined

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generated = await runCloudflareJson({
        ...credentials,
        instructions: `${storyboardInstructions}\n\nEvidence contains bounded sections from representative files at one immutable repository commit. Explain what the repository enables and how it operates as one system. The reader has never coded. Ground every explanation in cited evidence.${
          attempt === 1
            ? '\n\nYour previous storyboard copied repository wording and was rejected. Rewrite every title, caption, claim, summary, metaphor, uncertainty, and scene prompt entirely in fresh everyday language. Do not repeat any evidence phrase verbatim.'
            : ''
        }`,
        userInput:
          attempt === 1 && rejectedDraft
            ? {
                rejectedStoryboard: rejectedDraft,
                repairRequirements: {
                  preserveEvidenceIds: true,
                  preserveClaimIds: true,
                  preservePanelOrder: true,
                  rewriteEveryHumanFacingString: true,
                },
              }
            : evidence,
        format: responseFormat(comicAnalysisOutputSchema),
      })
      generatedUsage = {
        inputTokens: generatedUsage.inputTokens + generated.usage.inputTokens,
        outputTokens:
          generatedUsage.outputTokens + generated.usage.outputTokens,
      }
      const parsedDraft = comicAnalysisDraftSchema.safeParse(generated.value)
      if (!parsedDraft.success) {
        throw cloudflareAnalysisDiagnostic(
          'draft_schema',
          parsedDraft.error.issues,
        )
      }
      try {
        validateComicAnalysisDraft(
          parsedDraft.data,
          validEvidenceIds,
          evidenceText,
        )
        draft = parsedDraft.data
        break
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'validation failed'
        if (
          attempt === 0 &&
          message === 'Generated output repeats source evidence verbatim'
        ) {
          rejectedDraft = parsedDraft.data
          continue
        }
        throw cloudflareAnalysisDiagnostic('draft_validation', message)
      }
    }
    if (!draft) {
      throw cloudflareAnalysisDiagnostic(
        'draft_validation',
        'validation failed',
      )
    }

    const verified = await runCloudflareJson({
      ...credentials,
      instructions: verificationInstructions,
      userInput: { evidence, claims: draft.claims },
      format: responseFormat(claimVerificationBatchSchema),
    })
    const parsedVerification = claimVerificationBatchSchema.safeParse(
      verified.value,
    )
    if (!parsedVerification.success) {
      throw cloudflareAnalysisDiagnostic(
        'verification_schema',
        parsedVerification.error.issues,
      )
    }
    const verification = parsedVerification.data
    const analysis = buildVerifiedComicAnalysis({
      analysisInput: input,
      draft,
      verification,
      generationMode: 'cloudflare_byok',
    })

    return {
      analysis,
      usage: {
        analysis: generatedUsage,
        verification: verified.usage,
      },
    }
  } catch (error) {
    if (isCloudflareAnalysisFailure(error)) throw error
    throw cloudflareAnalysisDiagnostic(
      'draft_validation',
      error instanceof Error ? error.message : 'analysis failed',
    )
  }
}
