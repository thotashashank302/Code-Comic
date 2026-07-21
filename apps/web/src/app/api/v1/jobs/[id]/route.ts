import { getOwnedExplanation } from '@comic-code/database'

import { requireRequestSession } from '@/lib/auth/session'
import { jsonNoStore, routeErrorResponse } from '@/lib/http'
import { databaseClient, githubClient } from '@/lib/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requireRequestSession(request)
    const { id } = await context.params
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
    return jsonNoStore({
      job: {
        id: row.id,
        status: row.status,
        percent: row.progress_percent,
        message: row.progress_message,
        updatedAt: row.updated_at,
      },
    })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
