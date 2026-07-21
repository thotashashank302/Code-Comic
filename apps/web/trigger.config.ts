import { defineConfig } from '@trigger.dev/sdk'
import { syncEnvVars } from '@trigger.dev/build/extensions/core'

import { loadWorkspaceEnvironment } from './workspace-env'

loadWorkspaceEnvironment()

const workerEnvironment = [
  { name: 'GITHUB_APP_ID', isSecret: false },
  { name: 'GITHUB_PRIVATE_KEY_BASE64', isSecret: true },
  { name: 'NEXT_PUBLIC_SUPABASE_URL', isSecret: false },
  { name: 'SUPABASE_SECRET_KEY', isSecret: true },
  { name: 'SAFETY_IDENTIFIER_SECRET', isSecret: true },
] as const

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_replace_me',
  dirs: ['./src/trigger'],
  maxDuration: 360,
  machine: 'small-1x',
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      factor: 2,
      minTimeoutInMs: 2_000,
      maxTimeoutInMs: 20_000,
      randomize: true,
    },
  },
  build: {
    external: ['sharp'],
    extensions: [
      syncEnvVars(async () =>
        workerEnvironment.map(({ name, isSecret }) => {
          const value = process.env[name]
          if (!value)
            throw new Error(`Missing worker environment variable: ${name}`)
          return { name, value, isSecret }
        }),
      ),
    ],
  },
})
