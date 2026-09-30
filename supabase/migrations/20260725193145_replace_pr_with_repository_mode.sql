alter table public.explanations
  add column if not exists source_mode text not null default 'repository',
  add column if not exists repository_ref text,
  add column if not exists commit_sha text,
  add column if not exists scan_summary jsonb not null default '{}';

update public.explanations
set
  source_mode = 'pull_request',
  repository_ref = coalesce(repository_ref, 'legacy-pr'),
  commit_sha = coalesce(commit_sha, head_sha)
where commit_sha is null;

alter table public.explanations
  alter column repository_ref set not null,
  alter column commit_sha set not null,
  alter column pull_request_number drop not null,
  alter column base_sha drop not null,
  alter column head_sha drop not null;

alter table public.explanations
  drop constraint if exists selected_file_limit,
  add constraint selected_file_limit check (cardinality(selected_files) <= 40),
  add constraint explanation_source_mode check (
    source_mode in ('repository', 'pull_request')
  ),
  add constraint repository_ref_length check (
    length(repository_ref) between 1 and 255
  ),
  add constraint repository_commit_sha_format check (
    commit_sha ~ '^[a-fA-F0-9]{40}$'
  ),
  add constraint scan_summary_is_object check (
    jsonb_typeof(scan_summary) = 'object'
  );
