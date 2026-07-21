import type { ComicAnalysis, ComicAnalysisDraft } from '@comic-code/contracts'
import {
  claimVerificationBatchSchema,
  comicAnalysisDraftSchema,
  comicAnalysisSchema,
  comicPanelSchema,
} from '@comic-code/contracts'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'

import {
  serializeEvidence,
  storyboardInstructions,
  verificationInstructions,
} from './prompts'
import {
  assertNoVerbatimEvidence,
  assertSafeGeneratedText,
  sanitizeScenePrompt,
} from './security'
import type { AnalysisInput } from './types'

export type AnalyzeComicOptions = {
  apiKey: string
  model?: string
}

// OpenAI Structured Outputs supports homogeneous array schemas with item
// limits, but JSON Schema tuples serialize `items` as an array of schemas.
export const comicAnalysisOutputSchema = comicAnalysisDraftSchema.extend({
  panels: z.array(comicPanelSchema).length(4),
})

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function getUsage(response: {
  usage?: { input_tokens: number; output_tokens: number } | null
}) {
  return {
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  }
}

export function validateComicAnalysisDraft(
  draft: ComicAnalysisDraft,
  validEvidenceIds: Set<string>,
  evidenceText: string[],
) {
  const expectedPurposes = [
    'overview',
    'components',
    'flow',
    'outcome',
  ] as const
  const generalText = [
    draft.plainLanguageSummary,
    draft.metaphor,
    draft.sharedVisualStyle,
    ...draft.uncertainties,
  ]
  for (const value of generalText) {
    assertSafeGeneratedText(value)
    assertNoVerbatimEvidence(value, evidenceText)
  }
  const claimIds = new Set(draft.claims.map((claim) => claim.id))
  if (claimIds.size !== draft.claims.length) {
    throw new Error('The storyboard contains duplicate claim IDs')
  }

  for (const claim of draft.claims) {
    assertSafeGeneratedText(claim.text)
    assertNoVerbatimEvidence(claim.text, evidenceText)
    if (claim.evidenceIds.some((id) => !validEvidenceIds.has(id))) {
      throw new Error('The storyboard referenced unknown evidence')
    }
  }

  for (const [index, panel] of draft.panels.entries()) {
    if (panel.sequence !== index + 1) {
      throw new Error('The storyboard panels are out of sequence')
    }
    if (panel.purpose !== expectedPurposes[index]) {
      throw new Error(
        'The storyboard does not explain code in the required order',
      )
    }
    if (wordCount(panel.caption) > 40) {
      throw new Error('A storyboard caption exceeds 40 words')
    }
    if (panel.claimIds.some((id) => !claimIds.has(id))) {
      throw new Error('A storyboard panel referenced an unknown claim')
    }
    assertSafeGeneratedText(panel.title)
    assertSafeGeneratedText(panel.caption)
    assertSafeGeneratedText(panel.scenePrompt)
    assertNoVerbatimEvidence(panel.title, evidenceText)
    assertNoVerbatimEvidence(panel.caption, evidenceText)
    assertNoVerbatimEvidence(panel.scenePrompt, evidenceText)
    if (panel.uncertaintyNote) {
      assertSafeGeneratedText(panel.uncertaintyNote)
      assertNoVerbatimEvidence(panel.uncertaintyNote, evidenceText)
    }
  }
}

export function buildVerifiedComicAnalysis(input: {
  analysisInput: AnalysisInput
  draft: ComicAnalysisDraft
  verification: z.infer<typeof claimVerificationBatchSchema>
  generationMode: ComicAnalysis['generationMode']
}) {
  const verdicts = new Map(
    input.verification.results.map((result) => [
      result.claimId,
      result.verdict,
    ]),
  )

  const claims = input.draft.claims
    .filter((claim) => verdicts.get(claim.id) !== 'unsupported')
    .map((claim) => {
      const verdict = verdicts.get(claim.id)
      if (!verdict) throw new Error('A claim was not verified')
      return {
        ...claim,
        support: verdict,
        confidence:
          verdict === 'inferred' && claim.confidence === 'high'
            ? ('medium' as const)
            : claim.confidence,
      }
    })
  const survivingClaimIds = new Set(claims.map((claim) => claim.id))
  const panels = input.draft.panels.map((panel) => ({
    ...panel,
    scenePrompt: sanitizeScenePrompt(panel.scenePrompt),
    claimIds: panel.claimIds.filter((id) => survivingClaimIds.has(id)),
  })) as ComicAnalysisDraft['panels']

  if (panels.some((panel) => panel.claimIds.length === 0)) {
    throw new Error('Grounding verification removed every claim from a panel')
  }

  return comicAnalysisSchema.parse({
    ...input.draft,
    generationMode: input.generationMode,
    panels,
    claims,
    evidence: input.analysisInput.evidence.map((evidence) => evidence.locator),
    excludedFiles: input.analysisInput.excludedFiles,
  })
}

function extractParsed<T>(response: { output_parsed?: T | null }): T {
  if (!response.output_parsed) {
    throw new Error('OpenAI returned no parsed structured output')
  }
  return response.output_parsed
}

export async function analyzeComic(
  input: AnalysisInput,
  options: AnalyzeComicOptions,
) {
  const openai = new OpenAI({ apiKey: options.apiKey })
  const model = options.model ?? 'gpt-5.6-terra'
  const serializedEvidence = serializeEvidence(input)

  const analysisResponse = await openai.responses.parse({
    model,
    reasoning: { effort: 'medium' },
    store: false,
    safety_identifier: input.safetyIdentifier,
    instructions: storyboardInstructions,
    input: serializedEvidence,
    text: {
      format: zodTextFormat(comicAnalysisOutputSchema, 'comic_analysis'),
    },
  })
  const draft = comicAnalysisDraftSchema.parse(extractParsed(analysisResponse))
  const validEvidenceIds = new Set(
    input.evidence.map((evidence) => evidence.locator.id),
  )
  validateComicAnalysisDraft(
    draft,
    validEvidenceIds,
    input.evidence.map((evidence) => evidence.maskedText),
  )

  const verificationResponse = await openai.responses.parse({
    model,
    reasoning: { effort: 'medium' },
    store: false,
    safety_identifier: input.safetyIdentifier,
    instructions: verificationInstructions,
    input: JSON.stringify({
      evidence: JSON.parse(serializedEvidence),
      claims: draft.claims,
    }),
    text: {
      format: zodTextFormat(claimVerificationBatchSchema, 'claim_verification'),
    },
  })
  const verification = extractParsed(verificationResponse)
  const analysis = buildVerifiedComicAnalysis({
    analysisInput: input,
    draft,
    verification,
    generationMode: 'openai',
  })

  return {
    analysis,
    usage: {
      analysis: getUsage(analysisResponse),
      verification: getUsage(verificationResponse),
    },
  }
}
