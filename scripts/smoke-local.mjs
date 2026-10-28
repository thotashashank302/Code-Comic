import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'

const base = new URL(process.argv[2] || 'http://127.0.0.1:3000')
assert(
  ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname),
  'Use a local loopback server',
)
const checks = []
async function request(route, options = {}) {
  return fetch(new URL(route, base), {
    ...options,
    signal: AbortSignal.timeout(60_000),
    headers: {
      Origin: base.origin,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}
async function check(name, operation) {
  await operation()
  checks.push(name)
}
let disposableId
try {
  await check('local health and image runtime', async () => {
    const response = await request('/api/health')
    assert.equal(response.status, 200)
    assert.equal((await response.json()).mode, 'local')
  })
  await check('no service account or sign-in required', async () => {
    const response = await request('/api/v1/auth/me')
    assert.equal((await response.json()).user.id, 'local')
  })
  await check('remote origin rejected even with forged bearer', async () => {
    const response = await request('/api/v1/explanations', {
      method: 'POST',
      headers: {
        Origin: 'https://untrusted.example',
        Authorization: 'Bearer forged',
      },
      body: '{}',
    })
    assert.equal(response.status, 403)
  })
  await check('public Host header rejected', async () => {
    const status = await new Promise((resolve, reject) => {
      const outgoing = httpRequest(
        new URL('/api/v1/auth/me', base),
        {
          headers: { Host: 'public.example' },
          timeout: 10_000,
        },
        (response) => {
          response.resume()
          resolve(response.statusCode)
        },
      )
      outgoing.on('error', reject)
      outgoing.on('timeout', () =>
        outgoing.destroy(new Error('Host check timed out')),
      )
      outgoing.end()
    })
    assert.equal(status, 403)
  })
  await check('malformed generation rejected', async () => {
    assert.equal(
      (await request('/api/v1/explanations', { method: 'POST', body: '{}' }))
        .status,
      400,
    )
  })
  const inspected = await request(
    '/api/v1/github/repository?url=https://github.com/octocat/Spoon-Knife',
  )
  assert.equal(inspected.status, 200, await inspected.clone().text())
  const { repository } = await inspected.json()
  checks.push('real GitHub repository inspection')
  const created = await request('/api/v1/explanations', {
    method: 'POST',
    body: JSON.stringify({
      owner: repository.owner,
      repository: repository.repository,
      ref: repository.ref,
      commitSha: repository.commitSha,
      forceRegenerate: true,
    }),
  })
  assert.equal(created.status, 201, await created.clone().text())
  const { explanation } = await created.json()
  disposableId = explanation.id
  assert.equal(explanation.status, 'completed')
  assert.equal(explanation.commitSha, repository.commitSha)
  assert.equal(explanation.analysis.panels.length, 4)
  checks.push('generation completes at the inspected immutable commit')
  await check('download is a composed 1600 by 1200 PNG', async () => {
    const response = await request(explanation.artifactUrl)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    const png = Buffer.from(await response.arrayBuffer())
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(png.readUInt32BE(16), 1600)
    assert.equal(png.readUInt32BE(20), 1200)
  })
  await check('saved comic appears in persistent listing', async () => {
    const { explanations } = await (
      await request('/api/v1/explanations')
    ).json()
    assert(explanations.some((row) => row.id === disposableId))
  })
  await check('deletion removes access to both comic and PNG', async () => {
    assert.equal(
      (
        await request(`/api/v1/explanations/${disposableId}`, {
          method: 'DELETE',
        })
      ).status,
      200,
    )
    assert.equal(
      (await request(`/api/v1/explanations/${disposableId}`)).status,
      404,
    )
    assert.equal((await request(explanation.artifactUrl)).status, 404)
    disposableId = undefined
  })
  console.log(
    JSON.stringify(
      { ok: true, timestamp: new Date().toISOString(), checks },
      null,
      2,
    ),
  )
} catch (error) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        timestamp: new Date().toISOString(),
        checks,
        error: error instanceof Error ? error.message : 'Smoke test failed',
      },
      null,
      2,
    ),
  )
  throw error
} finally {
  if (disposableId)
    await request(`/api/v1/explanations/${disposableId}`, {
      method: 'DELETE',
    }).catch(() => undefined)
}
