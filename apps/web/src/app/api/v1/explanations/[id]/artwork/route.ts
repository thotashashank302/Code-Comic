import { randomUUID } from 'node:crypto'

import {
  completeExplanation,
  failExplanation,
  getOwnedExplanation,
  recordAuditEvent,
  recordUsage,
  removeArtifacts,
  uploadComicArtifact,
} from '@comic-code/database'
import { regenerateArtworkRequestSchema } from '@comic-code/contracts'
import { githubRequestStatus, preparePullRequest } from '@comic-code/github'

import { requireRequestSession } from '@/lib/auth/session'
import { getServerEnv } from '@/lib/env'
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

    stage = 'code_preparation'
    const prepared = await preparePullRequest({
      client: github,
      coordinate: {
        owner: row.github_owner,
        repository: row.github_repository,
        pullRequestNumber: row.pull_request_number,
      },
      expectedHeadSha: row.head_sha,
      selectedFiles: row.selected_files,
      allowPublicFallback: !access.isPrivate,
      fallbackAccessToken: session.accessToken,
    })

    // Load native image tooling only after authentication and repository access
    // checks. This keeps credentials and provider work outside unauthenticated
    // requests and avoids loading Sharp in routes that will be rejected early.
    stage = 'runtime_dependencies'
    const {
      analyzeCloudflareComic,
      cloudflareAnalysisModel,
      cloudflareImageModel,
      composeComic,
      createSafetyIdentifier,
      generateCloudflarePanelArtwork,
    } = await import('@comic-code/comic')

    stage = 'code_analysis'
    const analyzed = await analyzeCloudflareComic(
      {
        title: prepared.maskedTitle,
        description: prepared.maskedDescription,
        baseSha: prepared.snapshot.baseSha,
        headSha: prepared.snapshot.headSha,
        evidence: prepared.evidence,
        excludedFiles: prepared.excludedFiles,
        safetyIdentifier: createSafetyIdentifier(
          session.userId,
          getServerEnv().SAFETY_IDENTIFIER_SECRET,
        ),
      },
      {
        accountId: parsed.data.accountId,
        apiToken: parsed.data.apiToken,
      },
    )
    const analysis = {
      ...analyzed.analysis,
      artworkProvider: 'cloudflare_byok',
    } as const
    stage = 'image_generation'
    const artwork = await generateCloudflarePanelArtwork({
      accountId: parsed.data.accountId,
      apiToken: parsed.data.apiToken,
      analysis,
    })
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
        selectedFiles: prepared.selectedFiles,
        artifactPath,
        progressMessage:
          'Comic ready · code analyzed and illustrated with your Cloudflare credits',
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
    await recordUsage(database, {
      explanationId: id,
      userId: session.userId,
      model: `${cloudflareAnalysisModel}:byok`,
      imageModel: `${cloudflareImageModel}:byok`,
      inputTokens:
        analyzed.usage.analysis.inputTokens +
        analyzed.usage.verification.inputTokens,
      outputTokens:
        analyzed.usage.analysis.outputTokens +
        analyzed.usage.verification.outputTokens,
      imageCount: 4,
      retryCount: 0,
    }).catch(() => undefined)
    await recordAuditEvent(database, {
      explanationId: id,
      actorUserId: session.userId,
      eventType: 'byok_artwork_generated',
      metadata: {
        provider: 'cloudflare',
        codeAnalyzed: true,
        imageCount: 4,
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
    if (
      providerCode === 'image_provider_auth_failed' ||
      providerCode === 'image_provider_quota_reached' ||
      providerCode === 'image_provider_unavailable' ||
      providerCode === 'cloudflare_analysis_failed'
    ) {
      const status =
        providerCode === 'image_provider_auth_failed'
          ? 401
          : providerCode === 'image_provider_quota_reached'
            ? 429
            : 502
      const details =
        error && typeof error === 'object' && 'details' in error
          ? (error.details as {
              model?: string
              status?: number
              statusText?: string
              responseBody?: string
            })
          : undefined
      const providerStatus = details?.status
        ? `${details.status}${details.statusText ? ` ${details.statusText}` : ''}`
        : 'request failed'
      const detail =
        `Cloudflare Workers AI ${providerStatus}${details?.model ? ` for ${details.model}` : ''}: ${details?.responseBody?.trim() || providerCode}`.slice(
          0,
          4_000,
        )
      if (explanationId) {
        await failExplanation(databaseClient(), {
          explanationId,
          errorCode: providerCode,
          errorDetail: detail,
        }).catch((failure) => {
          console.error('Could not persist Cloudflare failure', {
            explanationId,
            errorMessage:
              failure instanceof Error
                ? failure.message.slice(0, 200)
                : 'unknown',
          })
        })
      }
      console.error('Cloudflare BYOK request failed', {
        stage,
        providerCode,
        providerStatus,
        model: details?.model,
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
      error.message.includes('no executable code evidence')
    ) {
      return routeErrorResponse(new HttpError(400, 'no_executable_code'))
    }
    console.error('Cloudflare BYOK request failed', {
      stage,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage:
        error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    })
    if (
      explanationId &&
      [
        'runtime_dependencies',
        'code_analysis',
        'image_generation',
        'composition',
      ].includes(stage)
    ) {
      const prefix =
        stage === 'runtime_dependencies'
          ? 'Comic Code image runtime error:'
          : `Comic Code artwork error during ${stage}:`
      const detail = `${prefix} ${
        error instanceof Error ? error.message : 'Unknown runtime failure'
      }`.slice(0, 4_000)
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
