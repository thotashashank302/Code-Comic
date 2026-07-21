import { z } from 'zod'

const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_PRIVATE_KEY_BASE64: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(32),
  GITHUB_APP_SLUG: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SHARE_TOKEN_PEPPER: z.string().min(32),
  SAFETY_IDENTIFIER_SECRET: z.string().min(32),
  SESSION_ENCRYPTION_SECRET: z.string().min(32),
  TRIGGER_SECRET_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(32),
})

const workerEnvSchema = serverEnvSchema.pick({
  GITHUB_APP_ID: true,
  GITHUB_PRIVATE_KEY_BASE64: true,
  NEXT_PUBLIC_SUPABASE_URL: true,
  SUPABASE_SECRET_KEY: true,
  SAFETY_IDENTIFIER_SECRET: true,
})

export type ServerEnv = z.infer<typeof serverEnvSchema>
export type WorkerEnv = z.infer<typeof workerEnvSchema>

let parsedServerEnv: ServerEnv | undefined
let parsedWorkerEnv: WorkerEnv | undefined

export function getServerEnv(): ServerEnv {
  parsedServerEnv ??= serverEnvSchema.parse(process.env)
  return parsedServerEnv
}

export function getWorkerEnv(): WorkerEnv {
  parsedWorkerEnv ??= workerEnvSchema.parse(process.env)
  return parsedWorkerEnv
}
