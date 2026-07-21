import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

export function loadWorkspaceEnvironment() {
  const envPath = path.join(workspaceRoot, '.env')
  if (existsSync(envPath)) process.loadEnvFile(envPath)
}
