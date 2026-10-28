import { spawnSync } from 'node:child_process'
import {
  existsSync,
  cpSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
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
if (result.status === 0) {
  const preview = new URL(
    '../apps/web/public/extension-preview/',
    import.meta.url,
  )
  rmSync(preview, { recursive: true, force: true })
  mkdirSync(preview, { recursive: true })
  cpSync(
    new URL('../apps/extension/.output/chrome-mv3/', import.meta.url),
    preview,
    { recursive: true },
  )
  const html = new URL('sidepanel.html', preview)
  writeFileSync(
    html,
    readFileSync(html, 'utf8').replace(/(src|href)="\//g, '$1="./'),
  )
}
process.exit(result.status ?? 1)
