import assert from 'node:assert/strict'

const base = new URL(process.argv[2] || 'http://127.0.0.1:3000')
assert(
  ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname),
  'Use the local preview server',
)
const checks = []
const read = async (path) => {
  const response = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(15_000),
  })
  assert.equal(response.status, 200, `${path} should load`)
  return response
}
const landing = await (await read('/')).text()
assert(landing.includes('Explore a sample'))
checks.push('web sample entry point loads')
assert(landing.includes('href="#api-key"'))
assert(landing.includes('id="image-provider"'))
assert(landing.includes('id="image-model"'))
assert(landing.includes('value="gemini"'))
assert(landing.includes('id="image-api-key"'))
checks.push(
  'BYOK provider, model and key controls exist before a repository scan',
)
const preview = await (await read('/extension')).text()
assert(preview.includes('/extension-preview/sidepanel.html?preview=1'))
checks.push('extension preview embeds the actual bundle in sample mode')
const frame = await read('/extension-preview/sidepanel.html?preview=1')
assert.equal(frame.headers.get('x-frame-options'), 'SAMEORIGIN')
assert(
  frame.headers.get('content-security-policy')?.includes("connect-src 'none'"),
)
checks.push(
  'browser preview blocks API connections and allows only same-origin framing',
)
const html = await frame.text()
const assets = [...html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)].map(
  (match) => match[1],
)
assert(assets.some((asset) => asset.endsWith('.js')))
assert(assets.some((asset) => asset.endsWith('.css')))
for (const asset of assets) {
  const response = await read(`/extension-preview/${asset.slice(2)}`)
  assert(
    !response.headers.get('content-type')?.includes('text/html'),
    `${asset} must not be an HTML fallback`,
  )
}
checks.push('extension scripts and styles resolve below the preview directory')
const font = Buffer.from(
  await (await read('/fonts/plus-jakarta-sans.woff2')).arrayBuffer(),
)
assert.equal(font.subarray(0, 4).toString(), 'wOF2')
checks.push('reference font is bundled locally')
const png = Buffer.from(await (await read('/sample-comic.png')).arrayBuffer())
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
assert.equal(png.readUInt32BE(16), 1600)
assert.equal(png.readUInt32BE(20), 1200)
checks.push('bundled sample is a full 1600 by 1200 PNG')
console.log(JSON.stringify({ ok: true, providerRequests: 0, checks }, null, 2))
