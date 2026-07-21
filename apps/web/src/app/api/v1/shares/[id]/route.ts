import { recordAuditEvent, revokeShareRecord } from '@comic-code/database'

import { requireRequestSession } from '@/lib/auth/session'
import { assertSameOrigin, jsonNoStore, routeErrorResponse } from '@/lib/http'
import { databaseClient } from '@/lib/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request)
    const session = await requireRequestSession(request)
    const { id } = await context.params
    const database = databaseClient()
    await revokeShareRecord(database, id, session.userId)
    await recordAuditEvent(database, {
      actorUserId: session.userId,
      eventType: 'share_revoked',
      metadata: { shareId: id },
    }).catch(() => undefined)
    return jsonNoStore({ ok: true })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
