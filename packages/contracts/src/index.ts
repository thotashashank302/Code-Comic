import { z } from 'zod'

export const repositoryCoordinateSchema = z.object({
  owner: z.string().trim().min(1).max(100),
  repository: z.string().trim().min(1).max(100),
  pullRequestNumber: z.number().int().positive(),
})

export const createExplanationRequestSchema = repositoryCoordinateSchema.extend(
  {
    headSha: z.string().regex(/^[a-f0-9]{40}$/i),
    selectedFiles: z.array(z.string().min(1).max(1_024)).max(20).optional(),
    forceRegenerate: z.boolean().default(false),
  },
)

export type CreateExplanationRequest = z.infer<
  typeof createExplanationRequestSchema
>

export const evidenceSourceSchema = z.enum([
  'diff',
  'code_context',
  'source_file',
  'pull_request_title',
  'pull_request_description',
])

export const persistedEvidenceLocatorSchema = z.object({
  id: z.string().min(1).max(100),
  source: evidenceSourceSchema,
  filePath: z.string().max(1_024).optional(),
  oldPath: z.string().max(1_024).optional(),
  status: z.enum(['added', 'modified', 'removed', 'renamed']).optional(),
  oldStart: z.number().int().nonnegative().optional(),
  oldEnd: z.number().int().nonnegative().optional(),
  newStart: z.number().int().nonnegative().optional(),
  newEnd: z.number().int().nonnegative().optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
})

export type PersistedEvidenceLocator = z.infer<
  typeof persistedEvidenceLocatorSchema
>

export const groundedClaimSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(320),
  support: z.enum(['direct', 'inferred']),
  evidenceIds: z.array(z.string().min(1).max(100)).min(1).max(12),
  confidence: z.enum(['high', 'medium', 'low']),
})

export type GroundedClaim = z.infer<typeof groundedClaimSchema>

export const comicPanelSchema = z.object({
  sequence: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  purpose: z.enum([
    'before',
    'change',
    'flow',
    'impact',
    'overview',
    'components',
    'outcome',
  ]),
  title: z.string().trim().min(1).max(60),
  caption: z.string().trim().min(1).max(320),
  scenePrompt: z.string().trim().min(1).max(1_200),
  claimIds: z.array(z.string().min(1).max(100)).min(1).max(8),
  confidence: z.enum(['high', 'medium', 'low']),
  uncertaintyNote: z.string().trim().max(240).nullable(),
})

export const comicAnalysisDraftSchema = z.object({
  plainLanguageSummary: z.string().trim().min(1).max(600),
  metaphor: z.string().trim().min(1).max(280),
  sharedVisualStyle: z.string().trim().min(1).max(500),
  panels: z.tuple([
    comicPanelSchema,
    comicPanelSchema,
    comicPanelSchema,
    comicPanelSchema,
  ]),
  claims: z.array(groundedClaimSchema).min(4).max(32),
  uncertainties: z.array(z.string().trim().min(1).max(240)).max(20),
})

export type ComicAnalysisDraft = z.infer<typeof comicAnalysisDraftSchema>

export const comicAnalysisSchema = comicAnalysisDraftSchema.extend({
  evidence: z.array(persistedEvidenceLocatorSchema).min(1).max(200),
  excludedFiles: z.array(z.string().max(1_024)).max(500),
  generationMode: z
    .enum(['openai', 'cloudflare_byok', 'deterministic_fallback'])
    .optional(),
  artworkProvider: z.enum(['openai', 'template', 'cloudflare_byok']).optional(),
})

export type ComicAnalysis = z.infer<typeof comicAnalysisSchema>

export const regenerateArtworkRequestSchema = z.object({
  provider: z.literal('cloudflare'),
  accountId: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{32}$/i),
  apiToken: z.string().trim().min(20).max(2_048),
})

export type RegenerateArtworkRequest = z.infer<
  typeof regenerateArtworkRequestSchema
>

export const claimVerificationSchema = z.object({
  claimId: z.string().min(1).max(100),
  verdict: z.enum(['direct', 'inferred', 'unsupported']),
  reason: z.string().trim().min(1).max(240),
})

export const claimVerificationBatchSchema = z.object({
  results: z.array(claimVerificationSchema).min(1).max(32),
})

export type ClaimVerificationBatch = z.infer<
  typeof claimVerificationBatchSchema
>

export const explanationStatusSchema = z.enum([
  'queued',
  'fetching',
  'analyzing',
  'verifying',
  'illustrating',
  'composing',
  'completed',
  'failed',
  'canceled',
  'deleted',
])

export type ExplanationStatus = z.infer<typeof explanationStatusSchema>

export const explanationProgressSchema = z.object({
  explanationId: z.string().uuid(),
  status: explanationStatusSchema,
  percent: z.number().int().min(0).max(100),
  message: z.string().trim().min(1).max(160),
  updatedAt: z.string().datetime(),
})

export type ExplanationProgress = z.infer<typeof explanationProgressSchema>
