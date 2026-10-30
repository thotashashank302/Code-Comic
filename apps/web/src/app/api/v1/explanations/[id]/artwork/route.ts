import { randomUUID } from 'node:crypto'

import {
  completeExplanation,
  failExplanation,
  getOwnedExplanation,
  recordAuditEvent,
  removeArtifacts,
  uploadComicArtifact,
} from '@comic-code/database'
import { regenerateArtworkRequestSchema } from '@comic-code/contracts'
import { githubRequestStatus } from '@comic-code/github'

import { requireRequestSession } from '@/lib/auth/session'
import {
  assertSameOrigin,
  HttpError,
  jsonNoStore,
  routeErrorResponse,
} from '@/lib/http'
import { databaseClient, githubClient, publicExplanation } from '@/lib/server'

export const maxDuration = 300

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  let stage = 'request'
  let explanationId: string | undefined
  let preserveExistingComic = false
  try {
    assertSameOrigin(request)
    const session = await requireRequestSession(request)
    const parsed = regenerateArtworkRequestSchema.safeParse(
      await request.json(),
    )
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_image_provider_credentials')
    }

    const { id } = await context.params
    explanationId = id
    const database = databaseClient()
    const row = await getOwnedExplanation(database, id, session.userId)
    preserveExistingComic =
      row.status === 'completed' &&
      Boolean(row.analysis) &&
      Boolean(row.final_artifact_path)
    if (!['completed', 'failed'].includes(row.status) || !row.analysis) {
      throw new HttpError(409, 'explanation_not_ready')
    }

    const github = githubClient()
    stage = 'repository_access'
    const access = await github.assertUserCanReadRepository(
      session.accessToken,
      row.github_owner,
      row.github_repository,
    )
    if (access.isPrivate) {
      await github.getInstallationId(row.github_owner, row.github_repository)
    }

    // Illustrate the existing storyboard. No raw source or additional analysis
    // request is needed; repository access above still protects private comics.
    stage = 'runtime_dependencies'
    const { composeComic, generateByokPanelArtwork } = await import(
      '@comic-code/comic'
    )
    const analysis = {
      ...row.analysis,
      artworkProvider: `${parsed.data.provider}_byok` as
        | 'openai_byok'
        | 'gemini_byok',
      artworkModel: parsed.data.model,
    }
    stage = 'image_generation'
    const artwork = await generateByokPanelArtwork(parsed.data, analysis)
    stage = 'composition'
    const comic = await composeComic(analysis, artwork)
    const artifactPath = await uploadComicArtifact(
      database,
      id,
      comic,
      `comic-${randomUUID()}.png`,
    )

    try {
      await completeExplanation(database, {
        explanationId: id,
        analysis,
        excludedFiles: analysis.excludedFiles,
        selectedFiles: row.selected_files,
        artifactPath,
        expectedArtifactPath: row.final_artifact_path,
        progressMessage:
          'Comic ready · illustrated with your own image API key',
      })
    } catch (error) {
      await removeArtifacts(database, [artifactPath]).catch(() => undefined)
      throw error
    }

    if (row.final_artifact_path && row.final_artifact_path !== artifactPath) {
      await removeArtifacts(database, [row.final_artifact_path]).catch(
        () => undefined,
      )
    }
    await recordAuditEvent(database, {
      explanationId: id,
      actorUserId: session.userId,
      eventType: 'byok_artwork_generated',
      metadata: {
        provider: parsed.data.provider,
        model: parsed.data.model,
        imageCount: analysis.panels.length,
      },
    }).catch(() => undefined)

    const updated = await getOwnedExplanation(database, id, session.userId)
    return jsonNoStore({ explanation: await publicExplanation(updated) })
  } catch (error) {
    const providerCode =
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : undefined
    if (providerCode === 'artwork_conflict')
      return routeErrorResponse(new HttpError(409, 'artwork_conflict'))
    if (
      providerCode === 'image_provider_auth_failed' ||
      providerCode === 'image_provider_quota_reached' ||
      providerCode === 'image_provider_unavailable' ||
      providerCode === 'image_provider_model_unavailable' ||
      providerCode === 'image_provider_rejected'
    ) {
      const status =
        providerCode === 'image_provider_auth_failed'
          ? 401
          : providerCode === 'image_provider_quota_reached'
            ? 429
            : 502
      const detail = providerCode
      if (explanationId && !preserveExistingComic) {
        await failExplanation(databaseClient(), {
          explanationId,
          errorCode: providerCode,
          errorDetail: detail,
        }).catch((failure) => {
          console.error('Could not persist image failure', {
            explanationId,
            errorMessage:
              failure instanceof Error
                ? failure.message.slice(0, 200)
                : 'unknown',
          })
        })
      }
      console.error('Image BYOK request failed', {
        stage,
        providerCode,
      })
      return routeErrorResponse(new HttpError(status, providerCode, detail))
    }
    const githubStatus = githubRequestStatus(error)
    if (githubStatus === 401) {
      return routeErrorResponse(new HttpError(401, 'github_reconnect_required'))
    }
    if (githubStatus === 403) {
      return routeErrorResponse(new HttpError(403, 'github_access_denied'))
    }
    if (githubStatus === 404) {
      return routeErrorResponse(new HttpError(404, 'repository_not_found'))
    }
    if (
      error instanceof Error &&
      error.message.includes('no readable executable source')
    ) {
      return routeErrorResponse(new HttpError(400, 'no_executable_code'))
    }
    console.error('Image BYOK request failed', {
      stage,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    })
    if (
      explanationId &&
      !preserveExistingComic &&
      ['runtime_dependencies', 'image_generation', 'composition'].includes(
        stage,
      )
    ) {
      const prefix =
        stage === 'runtime_dependencies'
          ? 'Comic Code image runtime error:'
          : `Comic Code artwork error during ${stage}:`
      const detail = `${prefix} Please retry; your existing comic is preserved.`
      await failExplanation(databaseClient(), {
        explanationId,
        errorCode:
          stage === 'runtime_dependencies'
            ? 'artwork_runtime_failed'
            : 'artwork_generation_failed',
        errorDetail: detail,
      }).catch(() => undefined)
      return routeErrorResponse(
        new HttpError(
          500,
          stage === 'runtime_dependencies'
            ? 'artwork_runtime_failed'
            : 'artwork_generation_failed',
          detail,
        ),
      )
    }
    return routeErrorResponse(error)
  }
}
