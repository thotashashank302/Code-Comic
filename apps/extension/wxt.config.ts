import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ envDir: '../..' }),
  manifest: {
    name: 'Comic Code',
    description:
      'Explain selected source code in GitHub pull requests as grounded four-panel comics.',
    minimum_chrome_version: '114',
    permissions: ['clipboardWrite', 'identity', 'sidePanel', 'storage', 'tabs'],
    host_permissions: [
      'https://github.com/*',
      'http://localhost:3000/*',
      'https://*.vercel.app/*',
    ],
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
  },
})
