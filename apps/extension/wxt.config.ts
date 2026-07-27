import path from 'node:path'

import { loadEnv } from 'vite'
import { defineConfig } from 'wxt'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const isReleaseCommand =
  process.argv.includes('build') || process.argv.includes('zip')

function apiBaseForMode(mode: string) {
  const configured = loadEnv(
    mode,
    repositoryRoot,
    'WXT_',
  ).WXT_PUBLIC_API_BASE_URL?.trim()
  if (!configured && mode === 'production' && isReleaseCommand) {
    throw new Error(
      'WXT_PUBLIC_API_BASE_URL is required for production extension builds',
    )
  }
  return configured || 'http://localhost:3000'
}

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: ({ mode }) => {
    apiBaseForMode(mode)
    return { envDir: repositoryRoot }
  },
  manifest: ({ mode }) => {
    const apiOrigin = new URL(apiBaseForMode(mode)).origin
    return {
      name: 'Comic Code',
      description:
        'Explain how an entire GitHub repository works as a grounded four-panel comic.',
      minimum_chrome_version: '114',
      permissions: [
        'clipboardWrite',
        'identity',
        'sidePanel',
        'storage',
        'tabs',
      ],
      host_permissions: ['https://github.com/*', `${apiOrigin}/*`],
      action: {
        default_title: 'Open Comic Code',
        default_icon: {
          16: 'icon/16.png',
          32: 'icon/32.png',
          48: 'icon/48.png',
          128: 'icon/128.png',
        },
      },
      icons: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    }
  },
})
