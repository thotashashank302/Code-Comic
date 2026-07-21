import { metadata, schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'

import {
  composeComic,
  createDeterministicComicAnalysis,
  createStoryboardFallbackArtwork,
  createSafetyIdentifier,
  deterministicFallbackModels,
} from '@comic-code/comic'
import {
  completeExplanation,
  failExplanation,
  getExplanationForWorker,
  getSupabaseAdmin,
  recordAuditEvent,
  recordUsage,
  saveExplanationAnalysis,
  updateExplanationProgress,
  uploadComicArtifact,
} from '@comic-code/database'
import { GitHubAppClient, preparePullRequest } from '@comic-code/github'

import { getWorkerEnv } from '@/lib/env'

const generationPayloadSchema = z.object({
  explanationId: z.uuid(),
})

function safeErrorCode(error: unknown) {
  if (!(error instanceof Error)) return 'generation_failed'
  if (error.message.includes('head changed')) return 'pull_request_changed'
  if (error.message.includes('3,000 changed-line')) return 'change_too_large'
  if (error.message.includes('no executable code')) return 'no_executable_code'
  if (error.message.includes('deleted')) return 'deleted_during_generation'
  if (error.message.includes('artwork')) return 'artwork_failed'
  if (error.message.includes('Grounding')) return 'grounding_failed'
  return 'generation_failed'
}

export const generateComicTask = schemaTask({
  id: 'generate-comic',
  schema: generationPayloadSchema,
  queue: { concurrencyLimit: 2 },
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 20_000,
    randomize: true,
  },
  run: async ({ explanationId }) => {
    const env = getWorkerEnv()
    const database = getSupabaseAdmin({
      url: env.NEXT_PUBLIC_SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
    })

    try {
      const row = await getExplanationForWorker(database, explanationId)
      if (row.status === 'completed') {
        return { explanationId, status: 'already_completed' as const }
      }

      const safetyIdentifier = createSafetyIdentifier(
        row.owner_user_id,
        env.SAFETY_IDENTIFIER_SECRET,
      )
      let analysis = row.analysis

      if (!analysis) {
        metadata.set('stage', 'fetching').set('percent', 10)
        await updateExplanationProgress(database, {
          explanationId,
          status: 'fetching',
          percent: 10,
          message: 'Reading the selected code and its surrounding context',
        })
        const github = new GitHubAppClient({
          appId: env.GITHUB_APP_ID,
          privateKeyBase64: env.GITHUB_PRIVATE_KEY_BASE64,
        })
        const prepared = await preparePullRequest({
          client: github,
          coordinate: {
            owner: row.github_owner,
            repository: row.github_repository,
            pullRequestNumber: row.pull_request_number,
          },
          expectedHeadSha: row.head_sha,
          selectedFiles: row.selected_files,
          allowPublicFallback: !row.is_private,
        })

        metadata.set('stage', 'analyzing').set('percent', 30)
        await updateExplanationProgress(database, {
          explanationId,
          status: 'analyzing',
          percent: 30,
          message: 'Analyzing what the selected code does',
        })
        const analysisInput = {
          title: prepared.maskedTitle,
          description: prepared.maskedDescription,
          baseSha: prepared.snapshot.baseSha,
          headSha: prepared.snapshot.headSha,
          evidence: prepared.evidence,
          excludedFiles: prepared.excludedFiles,
          safetyIdentifier,
        }
        analysis = createDeterministicComicAnalysis(analysisInput)
        await recordAuditEvent(database, {
          explanationId,
          actorUserId: row.owner_user_id,
          eventType: 'local_source_preview_created',
          metadata: { creatorCreditsUsed: false },
        })
        await updateExplanationProgress(database, {
          explanationId,
          status: 'analyzing',
          percent: 55,
          message: 'Building API-free source-code preview',
        })
        await saveExplanationAnalysis(database, { explanationId, analysis })
        await recordUsage(database, {
          explanationId,
          userId: row.owner_user_id,
          model: deterministicFallbackModels.analysis,
          imageModel: deterministicFallbackModels.image,
          inputTokens: 0,
          outputTokens: 0,
          imageCount: 0,
        })
      }

      if (!analysis) throw new Error('Storyboard analysis is unavailable')
      const resolvedAnalysis = analysis
      metadata.set('stage', 'illustrating').set('percent', 65)
      const artwork = await createStoryboardFallbackArtwork(resolvedAnalysis)
      analysis = {
        ...resolvedAnalysis,
        artworkProvider: 'template',
      }
      await updateExplanationProgress(database, {
        explanationId,
        status: 'composing',
        percent: 90,
        message: 'Composing the final comic',
      })
      metadata.set('stage', 'composing').set('percent', 90)
      const comic = await composeComic(analysis, artwork)

      // Recheck the tombstone immediately before every persistent output.
      await getExplanationForWorker(database, explanationId)
      const artifactPath = await uploadComicArtifact(
        database,
        explanationId,
        comic,
      )
      try {
        await completeExplanation(database, {
          explanationId,
          analysis,
          excludedFiles: analysis.excludedFiles,
          selectedFiles: row.selected_files,
          artifactPath,
          progressMessage: 'Comic ready · API-free source preview',
        })
      } catch (error) {
        await database.storage.from('comic-artifacts').remove([artifactPath])
        throw error
      }
      await recordUsage(database, {
        explanationId,
        userId: row.owner_user_id,
        model: deterministicFallbackModels.analysis,
        imageModel: deterministicFallbackModels.image,
        inputTokens: 0,
        outputTokens: 0,
        imageCount: 0,
      })
      await recordAuditEvent(database, {
        explanationId,
        actorUserId: row.owner_user_id,
        eventType: 'generation_completed',
      })
      metadata.set('stage', 'completed').set('percent', 100)
      return { explanationId, status: 'completed' as const }
    } catch (error) {
      const errorCode = safeErrorCode(error)
      if (errorCode !== 'deleted_during_generation') {
        await failExplanation(database, { explanationId, errorCode }).catch(
          () => undefined,
        )
      }
      throw error
    }
  },
})
