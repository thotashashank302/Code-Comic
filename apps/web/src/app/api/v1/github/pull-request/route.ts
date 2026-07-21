import {
  githubRequestStatus,
  parseGitHubPullRequestUrl,
  selectEligibleFiles,
} from '@comic-code/github'

import { requireRequestSession } from '@/lib/auth/session'
import { HttpError, jsonNoStore, routeErrorResponse } from '@/lib/http'
import { githubClient } from '@/lib/server'

export async function GET(request: Request) {
  try {
    const session = await requireRequestSession(request)
    const url = new URL(request.url).searchParams.get('url')
    const coordinate = url ? parseGitHubPullRequestUrl(url) : null
    if (!coordinate) throw new HttpError(400, 'invalid_pull_request_url')

    const github = githubClient()
    const access = await github.assertUserCanReadRepository(
      session.accessToken,
      coordinate.owner,
      coordinate.repository,
    )
    const allowPublicFallback = !access.isPrivate
    const [snapshot, files] = await Promise.all([
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
    const { eligible, excluded } = selectEligibleFiles(files)
    if (eligible.length === 0) {
      throw new HttpError(400, 'no_executable_code')
    }

    return jsonNoStore({
      pullRequest: {
        ...coordinate,
        title: snapshot.title,
        htmlUrl: snapshot.htmlUrl,
        isPrivate: access.isPrivate,
        baseSha: snapshot.baseSha,
        headSha: snapshot.headSha,
        files: eligible.slice(0, 20).map((file) => ({
          path: file.path,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
        })),
        excludedFileCount: excluded.length,
        selectedChangedLines: eligible
          .slice(0, 20)
          .reduce((sum, file) => sum + file.changes, 0),
      },
    })
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
