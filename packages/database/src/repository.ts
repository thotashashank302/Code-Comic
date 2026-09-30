import type {
  ComicAnalysis,
  CreateExplanationRequest,
  ExplanationStatus,
} from '@comic-code/contracts'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { ExplanationRow, ShareRow, UsageRow } from './types'

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function createExplanation(
  client: SupabaseClient,
  input: {
    userId: string
    request: CreateExplanationRequest
    commitSha: string
    resolvedRef: string
    isPrivate: boolean
    idempotencyKey: string
    scanSummary?: Record<string, unknown>
  },
) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000)
  const { data, error } = await client
    .from('explanations')
    .upsert(
      {
        owner_user_id: input.userId,
        github_owner: input.request.owner,
        github_repository: input.request.repository,
        source_mode: 'repository',
        repository_ref: input.resolvedRef,
        commit_sha: input.commitSha,
        scan_summary: input.scanSummary ?? {},
        pull_request_number: null,
        is_private: input.isPrivate,
        base_sha: null,
        head_sha: null,
        selected_files: [],
        status: 'queued',
        progress_percent: 0,
        progress_message: 'Queued for generation',
        idempotency_key: input.idempotencyKey,
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle()
  throwIfError(error)

  if (data) return data as ExplanationRow

  const existing = await client
    .from('explanations')
    .select('*')
    .eq('idempotency_key', input.idempotencyKey)
    .is('deleted_at', null)
    .single()
  throwIfError(existing.error)
  return existing.data as ExplanationRow
}

export async function getOwnedExplanation(
  client: SupabaseClient,
  explanationId: string,
  userId: string,
) {
  const { data, error } = await client
    .from('explanations')
    .select('*')
    .eq('id', explanationId)
    .eq('owner_user_id', userId)
    .is('deleted_at', null)
    .single()
  throwIfError(error)
  return data as ExplanationRow
}

export async function getExplanationByIdempotencyKey(
  client: SupabaseClient,
  idempotencyKey: string,
  userId: string,
) {
  const { data, error } = await client
    .from('explanations')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .eq('owner_user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  throwIfError(error)
  return data as ExplanationRow | null
}

export async function getExplanationForWorker(
  client: SupabaseClient,
  explanationId: string,
) {
  const { data, error } = await client
    .from('explanations')
    .select('*')
    .eq('id', explanationId)
    .is('deleted_at', null)
    .single()
  throwIfError(error)
  return data as ExplanationRow
}

export async function setExplanationTriggerRun(
  client: SupabaseClient,
  explanationId: string,
  triggerRunId: string,
) {
  const { data, error } = await client
    .from('explanations')
    .update({ trigger_run_id: triggerRunId })
    .eq('id', explanationId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()
  throwIfError(error)
  if (!data) throw new Error('Explanation was deleted before it was queued')
}

export async function updateExplanationProgress(
  client: SupabaseClient,
  input: {
    explanationId: string
    status: ExplanationStatus
    percent: number
    message: string
  },
) {
  const { data, error } = await client
    .from('explanations')
    .update({
      status: input.status,
      progress_percent: input.percent,
      progress_message: input.message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.explanationId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()
  throwIfError(error)
  if (!data) throw new Error('Explanation was deleted during generation')
}

export async function failExplanation(
  client: SupabaseClient,
  input: {
    explanationId: string
    errorCode: string
    errorDetail?: string
    onlyUndispatched?: boolean
  },
) {
  const errorDetail = input.errorDetail?.slice(0, 4_000) ?? null
  let query = client
    .from('explanations')
    .update({
      status: 'failed',
      progress_percent: 0,
      progress_message:
        errorDetail?.slice(0, 240) ??
        'Generation failed. You can safely try again.',
      error_code: input.errorCode.slice(0, 80),
      error_detail: errorDetail,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.explanationId)
    .is('deleted_at', null)
  if (input.onlyUndispatched) {
    query = query.is('trigger_run_id', null).neq('status', 'completed')
  }
  const { error } = await query
  throwIfError(error)
}

export async function completeExplanation(
  client: SupabaseClient,
  input: {
    explanationId: string
    analysis: ComicAnalysis
    excludedFiles: string[]
    selectedFiles: string[]
    artifactPath: string
    progressMessage?: string
  },
) {
  const { data, error } = await client
    .from('explanations')
    .update({
      analysis: input.analysis,
      excluded_files: input.excludedFiles,
      selected_files: input.selectedFiles,
      final_artifact_path: input.artifactPath,
      status: 'completed',
      progress_percent: 100,
      progress_message: input.progressMessage ?? 'Comic ready',
      error_code: null,
      error_detail: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.explanationId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()
  throwIfError(error)
  if (!data) throw new Error('Explanation was deleted before completion')
}

export async function saveExplanationAnalysis(
  client: SupabaseClient,
  input: { explanationId: string; analysis: ComicAnalysis },
) {
  const { data, error } = await client
    .from('explanations')
    .update({
      analysis: input.analysis,
      status: 'illustrating',
      progress_percent: 60,
      progress_message: 'Storyboard verified; creating artwork',
    })
    .eq('id', input.explanationId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()
  throwIfError(error)
  if (!data)
    throw new Error('Explanation was deleted before artwork generation')
}

export async function saveRepositoryScan(
  client: SupabaseClient,
  input: {
    explanationId: string
    selectedFiles: string[]
    excludedFiles: string[]
    scanSummary: Record<string, string | number | boolean>
  },
) {
  const { data, error } = await client
    .from('explanations')
    .update({
      selected_files: input.selectedFiles,
      excluded_files: input.excludedFiles,
      scan_summary: input.scanSummary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.explanationId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()
  throwIfError(error)
  if (!data) throw new Error('Explanation was deleted during repository scan')
}

export async function tombstoneExplanation(
  client: SupabaseClient,
  explanationId: string,
  userId: string,
) {
  const now = new Date().toISOString()
  const { data, error } = await client
    .from('explanations')
    .update({
      status: 'deleted',
      deleted_at: now,
      updated_at: now,
      progress_message: 'Deleted',
    })
    .eq('id', explanationId)
    .eq('owner_user_id', userId)
    .is('deleted_at', null)
    .select('id, final_artifact_path')
    .maybeSingle()
  throwIfError(error)
  return data as { id: string; final_artifact_path: string | null } | null
}

export async function createShareRecord(
  client: SupabaseClient,
  input: {
    explanationId: string
    userId: string
    tokenHash: string
  },
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000)
  const { data, error } = await client
    .from('shares')
    .insert({
      explanation_id: input.explanationId,
      created_by_user_id: input.userId,
      token_hash: input.tokenHash,
      expires_at: expiresAt.toISOString(),
    })
    .select('*')
    .single()
  throwIfError(error)
  return data as ShareRow
}

export async function resolveShareRecord(
  client: SupabaseClient,
  shareId: string,
  tokenHash: string,
) {
  const { data, error } = await client
    .from('shares')
    .select('*')
    .eq('id', shareId)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  throwIfError(error)
  return data as ShareRow | null
}

export async function revokeShareRecord(
  client: SupabaseClient,
  shareId: string,
  userId: string,
) {
  const { error } = await client
    .from('shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId)
    .eq('created_by_user_id', userId)
    .is('revoked_at', null)
  throwIfError(error)
}

export async function countRecentExplanations(
  client: SupabaseClient,
  userId: string,
  since: Date,
) {
  const { count, error } = await client
    .from('explanations')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', userId)
    .gte('created_at', since.toISOString())
  throwIfError(error)
  return count ?? 0
}

export async function recordUsage(
  client: SupabaseClient,
  input: {
    explanationId: string
    userId: string
    model: string
    imageModel: string
    inputTokens: number
    outputTokens: number
    imageCount: number
    retryCount?: number
  },
) {
  const { error } = await client.from('usage_events').upsert(
    {
      explanation_id: input.explanationId,
      user_id: input.userId,
      model: input.model,
      image_model: input.imageModel,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      image_count: input.imageCount,
      retry_count: input.retryCount ?? 0,
    },
    { onConflict: 'explanation_id' },
  )
  throwIfError(error)
}

export async function getUsageForExplanation(
  client: SupabaseClient,
  explanationId: string,
) {
  const { data, error } = await client
    .from('usage_events')
    .select('*')
    .eq('explanation_id', explanationId)
    .maybeSingle()
  throwIfError(error)
  return (data as UsageRow | null) ?? null
}

export async function recordAuditEvent(
  client: SupabaseClient,
  input: {
    explanationId?: string
    actorUserId?: string
    eventType: string
    metadata?: Record<string, string | number | boolean | null>
  },
) {
  const { error } = await client.from('audit_events').insert({
    explanation_id: input.explanationId,
    actor_user_id: input.actorUserId,
    event_type: input.eventType,
    metadata: input.metadata ?? {},
  })
  throwIfError(error)
}

export async function listExpiredExplanations(
  client: SupabaseClient,
  limit = 100,
) {
  const { data, error } = await client
    .from('explanations')
    .select('*')
    .lt('expires_at', new Date().toISOString())
    .is('deleted_at', null)
    .limit(Math.min(limit, 100))
  throwIfError(error)
  return (data ?? []) as ExplanationRow[]
}

export async function listTombstonedExplanations(
  client: SupabaseClient,
  limit = 100,
) {
  const { data, error } = await client
    .from('explanations')
    .select('*')
    .not('deleted_at', 'is', null)
    .limit(Math.min(limit, 100))
  throwIfError(error)
  return (data ?? []) as ExplanationRow[]
}

export async function hardDeleteTombstonedExplanation(
  client: SupabaseClient,
  explanationId: string,
) {
  const { error } = await client
    .from('explanations')
    .delete()
    .eq('id', explanationId)
    .not('deleted_at', 'is', null)
  throwIfError(error)
}

export async function deleteExpiredShares(client: SupabaseClient) {
  const { error, count } = await client
    .from('shares')
    .delete({ count: 'exact' })
    .lt('expires_at', new Date().toISOString())
  throwIfError(error)
  return count ?? 0
}
