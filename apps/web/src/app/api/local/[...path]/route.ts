import { handleLocalApi } from '@/lib/local-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const GET = handleLocalApi
export const POST = handleLocalApi
export const DELETE = handleLocalApi
