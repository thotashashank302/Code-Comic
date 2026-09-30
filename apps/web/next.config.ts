import type { NextConfig } from 'next'
import path from 'node:path'

import { loadWorkspaceEnvironment } from './workspace-env'

loadWorkspaceEnvironment()

const scriptSource =
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'"

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: `default-src 'self'; base-uri 'self'; connect-src 'self' https://*.supabase.co; font-src 'self' data:; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https://*.supabase.co; object-src 'none'; ${scriptSource}; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests`,
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
]

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  outputFileTracingIncludes: {
    '/*': [
      '../../node_modules/.pnpm/sharp@0.35.4*/node_modules/sharp/**/*',
      '../../node_modules/.pnpm/@img+sharp-linux-x64@0.35.4/node_modules/@img/sharp-linux-x64/**/*',
      '../../node_modules/.pnpm/@img+sharp-libvips-linux-x64@1.3.3/node_modules/@img/sharp-libvips-linux-x64/**/*',
    ],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    '@comic-code/comic',
    '@comic-code/contracts',
    '@comic-code/database',
    '@comic-code/github',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/share/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ]
  },
}

export default nextConfig
