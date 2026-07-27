import { idempotencyKeys, tasks } from '@trigger.dev/sdk'

import {
  createDeterministicComicAnalysis,
  createSafetyIdentifier,
} from '@comic-code/comic'
import { createExplanationRequestSchema } from '@comic-code/contracts'
import {
  countRecentExplanations,
  createExplanation,
  getExplanationByIdempotencyKey,
  recordAuditEvent,
  saveExplanationAnalysis,
  saveRepositoryScan,
  setExplanationTriggerRun,
} from '@comic-code/database'
import { githubRequestStatus, prepareRepository } from '@comic-code/github'

import type { generateComicTask } from '@/trigger/generate-comic'
import { requireRequestSession } from '@/lib/auth/session'
import { getServerEnv } from '@/lib/env'
import {
  assertSameOrigin,
  HttpError,
  jsonNoStore,
  routeErrorResponse,
} from '@/lib/http'
import {
  databaseClient,
  explanationIdempotencyKey,
  githubClient,
  publicExplanation,
} from '@/lib/server'

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const session = await requireRequestSession(request)
    const parsedRequest = createExplanationRequestSchema.parse(
      await request.json(),
    )
    const github = githubClient()
    const access = await github.assertUserCanReadRepository(
      session.accessToken,
      parsedRequest.owner,
      parsedRequest.repository,
    )
    const allowPublicFallback = !access.isPrivate
    const snapshot = await github
      .getRepositorySnapshot(
        parsedRequest,
        allowPublicFallback,
        session.accessToken,
      )
      .catch((error: unknown) => {
        if (access.isPrivate) {
          throw new HttpError(403, 'github_app_installation_required')
        }
        throw error
      })
    const resolvedRequest = {
      ...parsedRequest,
      owner: snapshot.owner,
      repository: snapshot.repository,
      ref: snapshot.resolvedRef,
    }
    let idempotencyKey = explanationIdempotencyKey(
      session.userId,
      resolvedRequest,
      snapshot.commitSha,
    )
    const database = databaseClient()
    const existing = await getExplanationByIdempotencyKey(
      database,
      idempotencyKey,
      session.userId,
    )
    if (
      existing &&
      existing.status !== 'failed' &&
      existing.status !== 'canceled'
    ) {
      return jsonNoStore(
        { explanation: await publicExplanation(existing) },
        { status: 200 },
      )
    }
    if (existing) {
      idempotencyKey = explanationIdempotencyKey(
        session.userId,
        { ...resolvedRequest, forceRegenerate: true },
        snapshot.commitSha,
      )
    }

    const recentCount = await countRecentExplanations(
      database,
      session.userId,
      new Date(Date.now() - 24 * 60 * 60 * 1_000),
    )
    if (recentCount >= 25) throw new HttpError(429, 'daily_quota_reached')

    // Scan while the authenticated GitHub OAuth token is available. Trigger
    // payloads intentionally contain only the explanation UUID, so deferring
    // this step would force public repositories onto GitHub's tiny anonymous
    // rate limit whenever the App is not installed on that repository.
    const prepared = await prepareRepository({
      client: github,
      coordinate: resolvedRequest,
      expectedCommitSha: snapshot.commitSha,
      allowPublicFallback,
      fallbackAccessToken: session.accessToken,
    })
    const analysis = createDeterministicComicAnalysis({
      repository: `${prepared.snapshot.owner}/${prepared.snapshot.repository}`,
      description: prepared.maskedDescription,
      ref: prepared.snapshot.resolvedRef,
      commitSha: prepared.snapshot.commitSha,
      evidence: prepared.evidence,
      excludedFiles: prepared.excludedFiles,
      safetyIdentifier: createSafetyIdentifier(
        session.userId,
        getServerEnv().SAFETY_IDENTIFIER_SECRET,
      ),
    })
    const scanSummary = {
      totalTreeFiles: prepared.totalTreeFiles,
      selectedFileCount: prepared.selectedFiles.length,
      excludedFileCount: prepared.excludedFileCount,
      scannedCharacters: prepared.scannedCharacters,
      commitSha: prepared.snapshot.commitSha,
      ref: prepared.snapshot.resolvedRef,
    }
    const explanation = await createExplanation(database, {
      userId: session.userId,
      request: resolvedRequest,
      commitSha: snapshot.commitSha,
      resolvedRef: snapshot.resolvedRef,
      isPrivate: access.isPrivate,
      idempotencyKey,
      scanSummary,
    })
    await saveRepositoryScan(database, {
      explanationId: explanation.id,
      selectedFiles: prepared.selectedFiles,
      excludedFiles: prepared.excludedFiles,
      scanSummary,
    })
    await saveExplanationAnalysis(database, {
      explanationId: explanation.id,
      analysis,
    })
    explanation.analysis = analysis
    explanation.selected_files = prepared.selectedFiles
    explanation.excluded_files = prepared.excludedFiles
    explanation.status = 'illustrating'
    explanation.progress_percent = 60
    explanation.progress_message = 'Storyboard verified; creating artwork'
    if (!explanation.trigger_run_id) {
      const triggerIdempotencyKey = await idempotencyKeys.create(
        idempotencyKey,
        { scope: 'global' },
      )
      const handle = await tasks.trigger<typeof generateComicTask>(
        'generate-comic',
        { explanationId: explanation.id },
        {
          idempotencyKey: triggerIdempotencyKey,
          idempotencyKeyTTL: '30d',
          tags: [`explanation_${explanation.id}`],
        },
      )
      await setExplanationTriggerRun(database, explanation.id, handle.id)
      explanation.trigger_run_id = handle.id
    }
    await recordAuditEvent(database, {
      explanationId: explanation.id,
      actorUserId: session.userId,
      eventType: 'repository_generation_requested',
      metadata: {
        ref: snapshot.resolvedRef,
        commitSha: snapshot.commitSha,
        creatorCreditsUsed: false,
      },
    }).catch(() => undefined)

    return jsonNoStore(
      { explanation: await publicExplanation(explanation) },
      { status: 202 },
    )
  } catch (error) {
    const status = githubRequestStatus(error)
    if (status === 401) {
      return routeErrorResponse(new HttpError(401, 'github_reconnect_required'))
    }
    if (status === 403) {
      return routeErrorResponse(new HttpError(403, 'github_access_denied'))
    }
    if (status === 404) {
      return routeErrorResponse(new HttpError(404, 'repository_not_found'))
    }
    return routeErrorResponse(error)
  }
}
