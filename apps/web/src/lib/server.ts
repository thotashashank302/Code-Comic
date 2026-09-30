import 'server-only'

import { createHmac, randomBytes, randomUUID } from 'node:crypto'

import { base64url } from 'jose'

import type { CreateExplanationRequest } from '@comic-code/contracts'
import {
  createShortLivedArtifactUrl,
  getSupabaseAdmin,
  type ExplanationRow,
} from '@comic-code/database'
import { GitHubAppClient } from '@comic-code/github'

import { getServerEnv } from '@/lib/env'

export function databaseClient() {
  const env = getServerEnv()
  return getSupabaseAdmin({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
  })
}

export function githubClient() {
  const env = getServerEnv()
  return new GitHubAppClient({
    appId: env.GITHUB_APP_ID,
    privateKeyBase64: env.GITHUB_PRIVATE_KEY_BASE64,
  })
}

export function explanationIdempotencyKey(
  userId: string,
  request: CreateExplanationRequest,
  commitSha: string,
) {
  const env = getServerEnv()
  const forceNonce = request.forceRegenerate ? randomUUID() : 'stable'
  return createHmac('sha256', env.SAFETY_IDENTIFIER_SECRET)
    .update(
      JSON.stringify({
        userId,
        owner: request.owner.toLowerCase(),
        repository: request.repository.toLowerCase(),
        ref: request.ref ?? null,
        commitSha: commitSha.toLowerCase(),
        scannerVersion: 1,
        forceNonce,
      }),
    )
    .digest('hex')
}

export function createShareCapability() {
  const token = base64url.encode(randomBytes(32))
  return { token, tokenHash: hashShareCapability(token) }
}

export function hashShareCapability(token: string) {
  return createHmac('sha256', getServerEnv().SHARE_TOKEN_PEPPER)
    .update(token)
    .digest('hex')
}

export async function publicExplanation(row: ExplanationRow) {
  const artifactUrl = row.final_artifact_path
    ? await createShortLivedArtifactUrl(
        databaseClient(),
        row.final_artifact_path,
        300,
      )
    : null

  return {
    id: row.id,
    repository: `${row.github_owner}/${row.github_repository}`,
    ref: row.repository_ref,
    commitSha: row.commit_sha,
    scanSummary: row.scan_summary,
    status: row.status,
    progress: {
      percent: row.progress_percent,
      message: row.progress_message,
      updatedAt: row.updated_at,
    },
    analysis: row.analysis,
    artifactUrl,
    errorCode: row.error_code,
    error: row.error_detail,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}
