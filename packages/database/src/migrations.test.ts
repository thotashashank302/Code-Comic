import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { afterEach, describe, expect, it } from 'vitest'

const migrationsDirectory = path.resolve(
  import.meta.dirname,
  '../../../supabase/migrations',
)
const migrations = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith('.sql'))
  .sort()
let database: PGlite | undefined

afterEach(async () => {
  await database?.close()
  database = undefined
})

async function setup() {
  database = new PGlite({ extensions: { pgcrypto } })
  // Supabase-owned roles and the bucket catalog, not application tables.
  // Run application migrations verbatim against embedded PostgreSQL.
  await database.exec(`
    create schema extensions;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]
    );
  `)
  return database
}

async function apply(db: PGlite, names: string[]) {
  for (const name of names)
    await db.exec(readFileSync(path.join(migrationsDirectory, name), 'utf8'))
}

const insertRepository = `insert into public.explanations (
  owner_user_id, github_owner, github_repository, is_private,
  repository_ref, commit_sha, selected_files, idempotency_key, expires_at
) values ('user', 'owner', 'repo', false, 'feature/fix', repeat('a', 40),
  array(select 'src/file-' || n || '.ts' from generate_series(1, 40) n), repeat('c', 64), now() + interval '1 day')`

async function assertSecurity(db: PGlite) {
  const tables = await db.query<{
    relname: string
    relrowsecurity: boolean
    relforcerowsecurity: boolean
  }>(`
    select relname, relrowsecurity, relforcerowsecurity from pg_class
    where relname in ('explanations', 'shares', 'usage_events', 'audit_events')
  `)
  expect(tables.rows).toHaveLength(4)
  expect(
    tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity),
  ).toBe(true)
  const grants = await db.query<{ allowed: boolean }>(`
    select has_table_privilege(role, 'public.' || name, 'SELECT,INSERT,UPDATE,DELETE') as allowed
    from unnest(array['anon', 'authenticated']) role,
         unnest(array['explanations', 'shares', 'usage_events', 'audit_events']) name
  `)
  expect(grants.rows.every((row) => !row.allowed)).toBe(true)
  const bucket = await db.query<{ public: boolean }>(
    'select public from storage.buckets where id = $1',
    ['comic-artifacts'],
  )
  expect(bucket.rows[0]?.public).toBe(false)
}

describe('repository mode SQL migrations', () => {
  it('installs on a fresh database with private tables and a 40-file limit', async () => {
    const db = await setup()
    await apply(db, migrations)
    await assertSecurity(db)
    await db.exec(insertRepository)
    await expect(
      db.exec(
        `update public.explanations set selected_files = array(select 'file-' || n from generate_series(1, 41) n)`,
      ),
    ).rejects.toThrow(/selected_file_limit/)
    await expect(
      db.exec(`update public.explanations set commit_sha = 'main'`),
    ).rejects.toThrow(/repository_commit_sha_format/)
    await expect(
      db.exec(`update public.explanations set scan_summary = '[]'`),
    ).rejects.toThrow(/scan_summary_is_object/)
    await expect(
      db.exec('set role anon; select * from public.explanations'),
    ).rejects.toThrow(/permission denied/)
  }, 30_000)

  it('upgrades legacy PR rows and hardens an existing platform helper', async () => {
    const db = await setup()
    await db.exec(
      `create function public.rls_auto_enable() returns event_trigger language plpgsql security definer as $$ begin return; end; $$;`,
    )
    const split = migrations.findIndex((name) =>
      name.includes('replace_pr_with_repository_mode'),
    )
    await apply(db, migrations.slice(0, split))
    await db.exec(`insert into public.explanations (
      owner_user_id, github_owner, github_repository, pull_request_number,
      is_private, base_sha, head_sha, idempotency_key, expires_at
    ) values ('user', 'owner', 'repo', 1, false, repeat('a', 40), repeat('b', 40), repeat('d', 64), now() + interval '1 day')`)
    await apply(db, migrations.slice(split))
    const legacy = await db.query<{
      source_mode: string
      repository_ref: string
      commit_sha: string
      pull_request_number: number
    }>(
      'select source_mode, repository_ref, commit_sha, pull_request_number from public.explanations',
    )
    expect(legacy.rows[0]).toEqual({
      source_mode: 'pull_request',
      repository_ref: 'legacy-pr',
      commit_sha: 'b'.repeat(40),
      pull_request_number: 1,
    })
    const permission = await db.query<{ allowed: boolean }>(
      `select has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') as allowed`,
    )
    expect(permission.rows[0]?.allowed).toBe(false)
    await db.exec(insertRepository)
    await assertSecurity(db)
    const index = await db.query(
      `select 1 from pg_indexes where indexname = 'shares_explanation_idx'`,
    )
    expect(index.rows).toHaveLength(1)
  }, 30_000)
})
