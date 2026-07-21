import {
  createShareRecord,
  getOwnedExplanation,
  recordAuditEvent,
} from '@comic-code/database'

import { requireRequestSession } from '@/lib/auth/session'
import { getServerEnv } from '@/lib/env'
import {
  assertSameOrigin,
  HttpError,
  jsonNoStore,
  routeErrorResponse,
} from '@/lib/http'
import {
  createShareCapability,
  databaseClient,
  githubClient,
} from '@/lib/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request)
    const session = await requireRequestSession(request)
    const { id } = await context.params
    const database = databaseClient()
    const explanation = await getOwnedExplanation(database, id, session.userId)
    const github = githubClient()
    const access = await github.assertUserCanReadRepository(
      session.accessToken,
      explanation.github_owner,
      explanation.github_repository,
    )
    if (access.isPrivate) {
      await github.getInstallationId(
        explanation.github_owner,
        explanation.github_repository,
      )
    }
    if (!explanation.analysis) {
      throw new HttpError(409, 'storyboard_not_ready')
    }

    const capability = createShareCapability()
    const share = await createShareRecord(database, {
      explanationId: id,
      userId: session.userId,
      tokenHash: capability.tokenHash,
    })
    await recordAuditEvent(database, {
      explanationId: id,
      actorUserId: session.userId,
      eventType: 'share_created',
    }).catch(() => undefined)
    const shareUrl = new URL(
      `/share/${share.id}`,
      getServerEnv().NEXT_PUBLIC_APP_URL,
    )
    shareUrl.hash = `token=${encodeURIComponent(capability.token)}`

    return jsonNoStore(
      {
        share: {
          id: share.id,
          url: shareUrl.href,
          expiresAt: share.expires_at,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    return routeErrorResponse(error)
  }
}
