import { runs } from '@trigger.dev/sdk'

import {
  getOwnedExplanation,
  recordAuditEvent,
  removeArtifacts,
  tombstoneExplanation,
} from '@comic-code/database'

import { requireRequestSession } from '@/lib/auth/session'
import { assertSameOrigin, jsonNoStore, routeErrorResponse } from '@/lib/http'
import { databaseClient, githubClient, publicExplanation } from '@/lib/server'

type RouteContext = { params: Promise<{ id: string }> }

async function authorizedRow(request: Request, id: string) {
  const session = await requireRequestSession(request)
  const row = await getOwnedExplanation(databaseClient(), id, session.userId)
  const github = githubClient()
  const access = await github.assertUserCanReadRepository(
    session.accessToken,
    row.github_owner,
    row.github_repository,
  )
  if (access.isPrivate) {
    await github.getInstallationId(row.github_owner, row.github_repository)
  }
  return { row, session }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const { row } = await authorizedRow(request, id)
    return jsonNoStore({ explanation: await publicExplanation(row) })
  } catch (error) {
    return routeErrorResponse(error)
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request)
    const { id } = await context.params
    const { row, session } = await authorizedRow(request, id)
    const database = databaseClient()
    const tombstone = await tombstoneExplanation(database, id, session.userId)
    if (!tombstone) return jsonNoStore({ ok: true })

    if (row.trigger_run_id) {
      await runs.cancel(row.trigger_run_id).catch(() => undefined)
    }
    if (tombstone.final_artifact_path) {
      await removeArtifacts(database, [tombstone.final_artifact_path]).catch(
        () => undefined,
      )
    }
    await recordAuditEvent(database, {
      explanationId: id,
      actorUserId: session.userId,
      eventType: 'explanation_deleted',
    }).catch(() => undefined)
    return jsonNoStore({ ok: true }, { status: 202 })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
