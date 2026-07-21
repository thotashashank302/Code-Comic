create extension if not exists pgcrypto with schema extensions;

create type public.explanation_status as enum (
  'queued',
  'fetching',
  'analyzing',
  'verifying',
  'illustrating',
  'composing',
  'completed',
  'failed',
  'canceled',
  'deleted'
);

create table public.explanations (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id text not null check (length(owner_user_id) between 1 and 64),
  github_owner text not null check (length(github_owner) between 1 and 100),
  github_repository text not null check (length(github_repository) between 1 and 100),
  pull_request_number integer not null check (pull_request_number > 0),
  is_private boolean not null,
  base_sha text not null check (base_sha ~ '^[a-fA-F0-9]{40}$'),
  head_sha text not null check (head_sha ~ '^[a-fA-F0-9]{40}$'),
  selected_files text[] not null default '{}',
  excluded_files text[] not null default '{}',
  status public.explanation_status not null default 'queued',
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  progress_message text not null default 'Queued for generation' check (length(progress_message) <= 160),
  analysis jsonb,
  final_artifact_path text,
  trigger_run_id text,
  idempotency_key text not null unique check (idempotency_key ~ '^[a-fA-F0-9]{64}$'),
  error_code text check (error_code is null or length(error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  constraint completed_explanation_has_output check (
    status <> 'completed' or (
      analysis is not null and
      final_artifact_path is not null and
      progress_percent = 100
    )
  ),
  constraint deleted_explanation_has_tombstone check (
    status <> 'deleted' or deleted_at is not null
  ),
  constraint selected_file_limit check (cardinality(selected_files) <= 20)
);

create index explanations_owner_created_idx
  on public.explanations (owner_user_id, created_at desc)
  where deleted_at is null;
create index explanations_retention_idx
  on public.explanations (expires_at)
  where deleted_at is null;
create index explanations_trigger_run_idx
  on public.explanations (trigger_run_id)
  where trigger_run_id is not null;

create table public.shares (
  id uuid primary key default extensions.gen_random_uuid(),
  explanation_id uuid not null references public.explanations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-fA-F0-9]{64}$'),
  created_by_user_id text not null check (length(created_by_user_id) between 1 and 64),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint share_expiry_after_creation check (expires_at > created_at)
);

create index shares_expiry_idx on public.shares (expires_at)
  where revoked_at is null;
create index shares_creator_idx on public.shares (created_by_user_id, created_at desc);

create table public.usage_events (
  id uuid primary key default extensions.gen_random_uuid(),
  explanation_id uuid not null unique references public.explanations(id) on delete cascade,
  user_id text not null check (length(user_id) between 1 and 64),
  model text not null check (length(model) between 1 and 100),
  image_model text not null check (length(image_model) between 1 and 100),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  image_count smallint not null default 0 check (image_count between 0 and 4),
  retry_count smallint not null default 0 check (retry_count between 0 and 10),
  created_at timestamptz not null default now()
);

create index usage_events_user_created_idx
  on public.usage_events (user_id, created_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  explanation_id uuid references public.explanations(id) on delete set null,
  actor_user_id text,
  event_type text not null check (length(event_type) between 1 and 80),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint audit_metadata_is_object check (jsonb_typeof(metadata) = 'object')
);

create index audit_events_explanation_idx
  on public.audit_events (explanation_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger explanations_set_updated_at
before update on public.explanations
for each row execute function public.set_updated_at();

alter table public.explanations enable row level security;
alter table public.explanations force row level security;
alter table public.shares enable row level security;
alter table public.shares force row level security;
alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;

revoke all on table public.explanations from anon, authenticated;
revoke all on table public.shares from anon, authenticated;
revoke all on table public.usage_events from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;
revoke all on sequence public.audit_events_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.explanations to service_role;
grant select, insert, update, delete on table public.shares to service_role;
grant select, insert, update on table public.usage_events to service_role;
grant select, insert on table public.audit_events to service_role;
grant usage, select on sequence public.audit_events_id_seq to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comic-artifacts',
  'comic-artifacts',
  false,
  10485760,
  array['image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Application access uses the server-only service role. Keeping Storage RLS
-- enabled with no anon/authenticated policies makes every object private by default.
