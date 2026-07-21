import { z } from 'zod'

import { getServerEnv } from '@/lib/env'
import { verifyGitHubWebhook } from '@/lib/github-webhook'
import { jsonNoStore } from '@/lib/http'

const webhookPayloadSchema = z.object({
  action: z.string().max(80).optional(),
  installation: z.object({ id: z.number().int().positive() }).optional(),
})

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > 1_000_000) {
    return jsonNoStore({ error: 'payload_too_large' }, { status: 413 })
  }
  const payload = await request.text()
  if (payload.length > 1_000_000) {
    return jsonNoStore({ error: 'payload_too_large' }, { status: 413 })
  }
  if (
    !verifyGitHubWebhook(
      payload,
      request.headers.get('x-hub-signature-256'),
      getServerEnv().GITHUB_WEBHOOK_SECRET,
    )
  ) {
    return jsonNoStore({ error: 'invalid_signature' }, { status: 401 })
  }

  const event = request.headers.get('x-github-event')
  if (!event || event.length > 80) {
    return jsonNoStore({ error: 'invalid_event' }, { status: 400 })
  }
  let body: unknown
  try {
    body = JSON.parse(payload)
  } catch {
    return jsonNoStore({ error: 'invalid_payload' }, { status: 400 })
  }
  const parsed = webhookPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return jsonNoStore({ error: 'invalid_payload' }, { status: 400 })
  }

  // Installation events are authenticated here. Access is also revalidated
  // against GitHub on every user operation, so stale grants fail closed.
  return jsonNoStore({ accepted: true }, { status: 202 })
}
