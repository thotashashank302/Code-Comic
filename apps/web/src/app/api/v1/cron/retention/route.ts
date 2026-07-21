import { runs } from '@trigger.dev/sdk'

import {
  deleteExpiredShares,
  hardDeleteTombstonedExplanation,
  listExpiredExplanations,
  listTombstonedExplanations,
  removeArtifacts,
  tombstoneExplanation,
} from '@comic-code/database'

import { getServerEnv } from '@/lib/env'
import { jsonNoStore } from '@/lib/http'
import { databaseClient } from '@/lib/server'

export const maxDuration = 60

export async function GET(request: Request) {
  if (
    request.headers.get('authorization') !==
    `Bearer ${getServerEnv().CRON_SECRET}`
  ) {
    return jsonNoStore({ error: 'unauthorized' }, { status: 401 })
  }

  const database = databaseClient()
  const [expired, tombstoned] = await Promise.all([
    listExpiredExplanations(database),
    listTombstonedExplanations(database),
  ])
  const cleanup = new Map(
    [...expired, ...tombstoned].map((row) => [row.id, row]),
  )
  let deleted = 0

  for (const row of cleanup.values()) {
    const tombstone = row.deleted_at
      ? { id: row.id, final_artifact_path: row.final_artifact_path }
      : await tombstoneExplanation(database, row.id, row.owner_user_id)
    if (!tombstone) continue
    if (row.trigger_run_id) {
      await runs.cancel(row.trigger_run_id).catch(() => undefined)
    }
    if (tombstone.final_artifact_path) {
      await removeArtifacts(database, [tombstone.final_artifact_path])
    }
    await hardDeleteTombstonedExplanation(database, row.id)
    deleted += 1
  }

  const expiredShares = await deleteExpiredShares(database)
  return jsonNoStore({ ok: true, deleted, expiredShares })
}
