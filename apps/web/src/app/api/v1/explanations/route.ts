import { idempotencyKeys, tasks } from '@trigger.dev/sdk'

import { createExplanationRequestSchema } from '@comic-code/contracts'
import {
  countRecentExplanations,
  createExplanation,
  getExplanationByIdempotencyKey,
  recordAuditEvent,
  setExplanationTriggerRun,
} from '@comic-code/database'
import { githubRequestStatus, selectEligibleFiles } from '@comic-code/github'

import type { generateComicTask } from '@/trigger/generate-comic'
import { requireRequestSession } from '@/lib/auth/session'
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
    const coordinate = {
      owner: parsedRequest.owner,
      repository: parsedRequest.repository,
      pullRequestNumber: parsedRequest.pullRequestNumber,
    }
    const [snapshot, changedFiles] = await Promise.all([
      github.getPullRequestSnapshot(
        coordinate,
        allowPublicFallback,
        session.accessToken,
      ),
      github.listChangedFiles(
        coordinate,
        allowPublicFallback,
        session.accessToken,
      ),
    ]).catch((error: unknown) => {
      if (access.isPrivate) {
        throw new HttpError(403, 'github_app_installation_required')
      }
      throw error
    })
    if (
      snapshot.headSha.toLowerCase() !== parsedRequest.headSha.toLowerCase()
    ) {
      throw new HttpError(409, 'pull_request_changed')
    }

    const selection = selectEligibleFiles(
      changedFiles,
      parsedRequest.selectedFiles,
    )
    if (
      parsedRequest.selectedFiles &&
      selection.eligible.length !== new Set(parsedRequest.selectedFiles).size
    ) {
      throw new HttpError(400, 'invalid_selected_files')
    }
    if (selection.eligible.length === 0) {
      throw new HttpError(400, 'no_executable_code')
    }
    const changedLines = selection.eligible.reduce(
      (sum, file) => sum + file.changes,
      0,
    )
    if (changedLines > 3_000) {
      throw new HttpError(413, 'change_too_large')
    }

    const resolvedRequest = {
      ...parsedRequest,
      selectedFiles: selection.eligible.map((file) => file.path),
    }
    const idempotencyKey = explanationIdempotencyKey(
      session.userId,
      resolvedRequest,
    )
    const database = databaseClient()
    const existing = await getExplanationByIdempotencyKey(
      database,
      idempotencyKey,
      session.userId,
    )
    if (existing) {
      return jsonNoStore(
        { explanation: await publicExplanation(existing) },
        { status: 200 },
      )
    }

    const recentCount = await countRecentExplanations(
      database,
      session.userId,
      new Date(Date.now() - 24 * 60 * 60 * 1_000),
    )
    if (recentCount >= 25) throw new HttpError(429, 'daily_quota_reached')

    const explanation = await createExplanation(database, {
      userId: session.userId,
      request: resolvedRequest,
      baseSha: snapshot.baseSha,
      isPrivate: access.isPrivate,
      idempotencyKey,
    })
    if (!explanation.trigger_run_id) {
      const triggerIdempotencyKey = await idempotencyKeys.create(
        idempotencyKey,
        {
          scope: 'global',
        },
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
      eventType: 'generation_requested',
      metadata: {
        selectedFileCount: resolvedRequest.selectedFiles.length,
        changedLines,
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
