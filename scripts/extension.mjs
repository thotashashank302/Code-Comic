import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(envPath)) process.loadEnvFile(envPath)

const command = process.argv[2]
if (!['build', 'zip'].includes(command))
  throw new Error('Expected build or zip')
const result = spawnSync(
  'pnpm',
  ['--filter', '@comic-code/extension', command],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      WXT_PUBLIC_API_BASE_URL:
        process.env.WXT_PUBLIC_API_BASE_URL?.trim() || 'http://127.0.0.1:3000',
    },
    shell: process.platform === 'win32',
  },
)
if (result.error) throw result.error
process.exit(result.status ?? 1)
