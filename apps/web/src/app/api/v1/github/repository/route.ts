import {
  githubRequestStatus,
  parseGitHubRepositoryUrl,
  selectRepositoryFiles,
} from '@comic-code/github'

import { detectedLanguages } from '@/lib/repository-summary'

import { requireRequestSession } from '@/lib/auth/session'
import { HttpError, jsonNoStore, routeErrorResponse } from '@/lib/http'
import { githubClient } from '@/lib/server'

export async function GET(request: Request) {
  try {
    const session = await requireRequestSession(request)
    const url = new URL(request.url).searchParams.get('url')
    const coordinate = url ? parseGitHubRepositoryUrl(url) : null
    if (!coordinate) throw new HttpError(400, 'invalid_repository_url')

    const github = githubClient()
    const access = await github.assertUserCanReadRepository(
      session.accessToken,
      coordinate.owner,
      coordinate.repository,
    )
    const allowPublicFallback = !access.isPrivate
    const snapshot = await github
      .getRepositorySnapshot(
        coordinate,
        allowPublicFallback,
        session.accessToken,
        true,
      )
      .catch((error: unknown) => {
        if (access.isPrivate) {
          throw new HttpError(403, 'github_app_installation_required')
        }
        throw error
      })
    const tree = await github.listRepositoryFiles(
      snapshot,
      allowPublicFallback,
      session.accessToken,
    )
    const selection = selectRepositoryFiles(tree)
    if (selection.selected.length === 0) {
      throw new HttpError(400, 'no_executable_code')
    }

    return jsonNoStore({
      repository: {
        owner: snapshot.owner,
        repository: snapshot.repository,
        description: snapshot.description,
        htmlUrl: snapshot.htmlUrl,
        isPrivate: snapshot.isPrivate,
        defaultBranch: snapshot.defaultBranch,
        ref: snapshot.resolvedRef,
        commitSha: snapshot.commitSha,
        totalFiles: tree.length,
        selectedFileCount: selection.selected.length,
        excludedFileCount: selection.excluded.length,
        representativeFiles: selection.selected.map((file) => file.path),
        languages: detectedLanguages(
          selection.selected.map((file) => file.path),
        ),
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
