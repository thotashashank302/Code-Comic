import type { ComicAnalysis, ExplanationStatus } from '@comic-code/contracts'

export type ExplanationRow = {
  id: string
  owner_user_id: string
  github_owner: string
  github_repository: string
  source_mode: 'repository' | 'pull_request'
  repository_ref: string
  commit_sha: string
  scan_summary: Record<string, unknown>
  pull_request_number: number | null
  is_private: boolean
  base_sha: string | null
  head_sha: string | null
  status: ExplanationStatus
  progress_percent: number
  progress_message: string
  analysis: ComicAnalysis | null
  excluded_files: string[]
  selected_files: string[]
  final_artifact_path: string | null
  trigger_run_id: string | null
  idempotency_key: string
  error_code: string | null
  error_detail: string | null
  created_at: string
  updated_at: string
  expires_at: string
  deleted_at: string | null
}

export type ShareRow = {
  id: string
  explanation_id: string
  token_hash: string
  created_by_user_id: string
  created_at: string
  expires_at: string
  revoked_at: string | null
}

export type UsageRow = {
  id: string
  explanation_id: string
  user_id: string
  model: string
  image_model: string
  input_tokens: number
  output_tokens: number
  image_count: number
  retry_count: number
  created_at: string
}
