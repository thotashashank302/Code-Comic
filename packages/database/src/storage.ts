import type { SupabaseClient } from '@supabase/supabase-js'

export const artifactBucket = 'comic-artifacts'

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function uploadComicArtifact(
  client: SupabaseClient,
  explanationId: string,
  png: Uint8Array,
  filename = 'comic.png',
) {
  if (!/^[a-zA-Z0-9-]+\.png$/.test(filename)) {
    throw new Error('Invalid artifact filename')
  }
  const path = `${explanationId}/${filename}`
  const { error } = await client.storage
    .from(artifactBucket)
    .upload(path, png, {
      contentType: 'image/png',
      cacheControl: '0',
      upsert: true,
    })
  throwIfError(error)
  return path
}

export async function createShortLivedArtifactUrl(
  client: SupabaseClient,
  path: string,
  expiresInSeconds = 300,
) {
  const { data, error } = await client.storage
    .from(artifactBucket)
    .createSignedUrl(path, Math.min(expiresInSeconds, 300))
  throwIfError(error)
  if (!data) throw new Error('Supabase did not return a signed artifact URL')
  return data.signedUrl
}

export async function removeArtifacts(client: SupabaseClient, paths: string[]) {
  if (paths.length === 0) return
  const { error } = await client.storage.from(artifactBucket).remove(paths)
  throwIfError(error)
}
