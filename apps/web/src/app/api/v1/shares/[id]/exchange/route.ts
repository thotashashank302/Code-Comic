import { z } from 'zod'

import {
  getExplanationForWorker,
  resolveShareRecord,
} from '@comic-code/database'

import { HttpError, jsonNoStore, routeErrorResponse } from '@/lib/http'
import {
  databaseClient,
  hashShareCapability,
  publicExplanation,
} from '@/lib/server'

const exchangeSchema = z.object({ token: z.string().min(40).max(100) })
type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const { token } = exchangeSchema.parse(await request.json())
    const database = databaseClient()
    const share = await resolveShareRecord(
      database,
      id,
      hashShareCapability(token),
    )
    if (!share) throw new HttpError(404, 'share_not_found')
    const explanation = await getExplanationForWorker(
      database,
      share.explanation_id,
    )
    if (!explanation.analysis) throw new HttpError(404, 'share_not_found')

    return jsonNoStore({ explanation: await publicExplanation(explanation) })
  } catch (error) {
    return routeErrorResponse(error)
  }
}
