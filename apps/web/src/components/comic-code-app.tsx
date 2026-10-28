'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ComicAnalysis } from '@comic-code/contracts'
import { sampleExplanation, sampleRepository } from '@comic-code/comic/sample'

import { BrandMark } from '@/components/brand-mark'
import { Storyboard } from '@/components/storyboard'
import { ProductMosaic } from '@/components/product-mosaic'

type User = { id: string; login: string; avatarUrl: string | null }
type Repository = {
  owner: string
  repository: string
  description: string
  htmlUrl: string
  isPrivate: boolean
  defaultBranch: string
  ref: string
  commitSha: string
  totalFiles: number
  selectedFileCount: number
  excludedFileCount: number
  representativeFiles: string[]
  languages: string[]
}
type Explanation = {
  id: string
  repository: string
  ref: string
  commitSha: string
  status: string
  progress: { percent: number; message: string; updatedAt: string }
  analysis: ComicAnalysis | null
  artifactUrl: string | null
  errorCode: string | null
  error: string | null
  expiresAt: string
}

const terminalStatuses = new Set(['completed', 'failed', 'canceled', 'deleted'])

function friendlyError(code: string) {
  if (
    code.startsWith('Cloudflare Workers AI ') ||
    code.startsWith('Comic Code image runtime error:') ||
    code.startsWith('Comic Code artwork error during ')
  ) {
    return code
  }
  const messages: Record<string, string> = {
    github_rate_limited:
      'GitHub request limit reached. Wait for it to reset, or configure an optional GITHUB_TOKEN for a higher limit.',
    github_token_invalid:
      'The configured GITHUB_TOKEN is invalid or expired. Replace or remove it, then restart.',
    repository_too_large:
      'GitHub returned an incomplete tree for this large repository. Try a smaller repository.',
    local_public_only:
      'Local mode supports public repositories. Use hosted mode with GitHub sign-in for private code.',
    local_busy:
      'Another comic operation is still running. Wait for it to finish, then retry.',
    local_storage_full:
      'You have 100 saved comics. Delete an older comic before creating another.',
    comic_not_found: 'This comic expired or was deleted. Generate it again.',
    local_request_failed:
      'The local request failed. Check your internet connection and that the comic data directory is writable, then retry.',

    authentication_required: 'Connect GitHub to continue.',
    invalid_repository_url: 'Paste a full GitHub repository URL.',
    repository_changed:
      'The repository branch moved. Inspect it again before generating.',
    daily_quota_reached:
      'Daily safety limit is 25 comics. Try again after 24 hours.',
    no_executable_code:
      'This repository has no safe, readable source files to explain.',
    github_reconnect_required:
      'Your GitHub login expired. Reconnect GitHub, then try again.',
    github_access_denied:
      'GitHub denied access to this repository. Check your account and GitHub App permissions.',
    repository_not_found:
      'GitHub could not find this repository or your account cannot access it.',
    github_app_installation_required:
      'Install the read-only Comic Code GitHub App on this private repository, then try again.',
    invalid_image_provider_credentials:
      'Enter a valid 32-character Cloudflare Account ID and API token.',
    image_provider_auth_failed:
      'Cloudflare rejected these credentials. Check Account ID and Workers AI token permissions.',
    image_provider_quota_reached:
      'This Cloudflare account has reached its Workers AI limit.',
    image_provider_unavailable:
      'Cloudflare image generation is temporarily unavailable. Your existing comic is unchanged.',
    cloudflare_analysis_failed:
      'Cloudflare could not create a grounded code explanation. Check that Workers AI is enabled, then retry; your existing comic is unchanged.',
    explanation_not_ready:
      'Wait for the template comic to finish before generating AI artwork.',
  }
  return messages[code] ?? 'Something went wrong. Please try again.'
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const responseText = await response.text()
  const data = (
    responseText
      ? (() => {
          try {
            return JSON.parse(responseText) as T
          } catch {
            return {} as T
          }
        })()
      : ({} as T)
  ) as T & {
    error?: string
    detail?: string
  }
  if (!response.ok)
    throw new Error(
      data.detail ?? data.error ?? `request_failed_${response.status}`,
    )
  return data
}

export function ComicCodeApp() {
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [localMode, setLocalMode] = useState(false)
  const [sampleMode, setSampleMode] = useState(false)
  const [recent, setRecent] = useState<Explanation[]>([])
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [repository, setRepository] = useState<Repository | null>(null)
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const [cloudflareAccountId, setCloudflareAccountId] = useState('')
  const [cloudflareApiToken, setCloudflareApiToken] = useState('')
  const [artworkBusy, setArtworkBusy] = useState(false)
  const [artworkNotice, setArtworkNotice] = useState<string | null>(null)
  const [aiGenerationRequested, setAiGenerationRequested] = useState(false)
  const pendingCloudflare = useRef(false)
  const cloudflareReady =
    cloudflareAccountId.trim().length === 32 &&
    cloudflareApiToken.trim().length >= 20

  useEffect(() => {
    const controller = new AbortController()
    api<{ user: User | null; mode?: string }>('/api/v1/auth/me', {
      signal: controller.signal,
    })
      .then(async (result) => {
        setUser(result.user)
        setLocalMode(result.mode === 'local')
        if (result.mode === 'local') {
          const saved = await api<{ explanations: Explanation[] }>(
            '/api/v1/explanations',
            { signal: controller.signal },
          )
          setRecent(saved.explanations)
        }
      })
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true))
    return () => controller.abort()
  }, [])

  const activeExplanationId = explanation?.id
  const activeStatus = explanation?.status
  useEffect(() => {
    if (
      !activeExplanationId ||
      !activeStatus ||
      terminalStatuses.has(activeStatus)
    ) {
      return
    }
    let active = true
    const refresh = async () => {
      try {
        const result = await api<{ explanation: Explanation }>(
          `/api/v1/explanations/${activeExplanationId}`,
        )
        if (active) setExplanation(result.explanation)
      } catch {
        // Keep the last known progress; the next poll may recover.
      }
    }
    const interval = window.setInterval(refresh, 2_500)
    void refresh()
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [activeExplanationId, activeStatus])

  const inspectRepository = async () => {
    setSampleMode(false)
    if (!user) {
      // OAuth needs a full browser navigation so the GitHub redirect can leave the app.
      window.location.assign(
        new URL(
          '/api/v1/auth/github/start?return_to=/',
          window.location.origin,
        ),
      )
      return
    }
    setBusy(true)
    setError(null)
    setRepository(null)
    setExplanation(null)
    setAiGenerationRequested(false)
    try {
      const result = await api<{ repository: Repository }>(
        `/api/v1/github/repository?url=${encodeURIComponent(repositoryUrl)}`,
      )
      setRepository(result.repository)
    } catch (caught) {
      pendingCloudflare.current = false
      setAiGenerationRequested(false)
      setError(
        friendlyError(
          caught instanceof Error ? caught.message : 'request_failed',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const generate = async () => {
    if (sampleMode) {
      setExplanation(sampleExplanation)
      return
    }
    if (!repository) return
    setBusy(true)
    setError(null)
    pendingCloudflare.current = cloudflareReady
    setAiGenerationRequested(cloudflareReady)
    try {
      const result = await api<{ explanation: Explanation }>(
        '/api/v1/explanations',
        {
          method: 'POST',
          body: JSON.stringify({
            owner: repository.owner,
            repository: repository.repository,
            ref: repository.ref,
            commitSha: repository.commitSha,
            forceRegenerate: Boolean(explanation),
          }),
        },
      )
      setExplanation(result.explanation)
      if (localMode)
        setRecent((rows) => [
          result.explanation,
          ...rows.filter((row) => row.id !== result.explanation.id),
        ])
    } catch (caught) {
      pendingCloudflare.current = false
      setAiGenerationRequested(false)
      setError(
        friendlyError(
          caught instanceof Error ? caught.message : 'request_failed',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const createShare = async () => {
    if (!explanation) return
    setShareNotice(null)
    try {
      const result = await api<{ share: { url: string } }>(
        `/api/v1/explanations/${explanation.id}/shares`,
        { method: 'POST' },
      )
      await navigator.clipboard.writeText(result.share.url)
      setShareNotice('Private link copied · expires in 7 days')
    } catch (caught) {
      setError(
        friendlyError(
          caught instanceof Error ? caught.message : 'request_failed',
        ),
      )
    }
  }

  const generateWithCloudflare = useCallback(
    async (target: Explanation) => {
      if (sampleMode || !target.analysis) return
      setAiGenerationRequested(true)
      setArtworkBusy(true)
      setArtworkNotice(null)
      setError(null)
      try {
        const result = await api<{ explanation: Explanation }>(
          `/api/v1/explanations/${target.id}/artwork`,
          {
            method: 'POST',
            body: JSON.stringify({
              provider: 'cloudflare',
              accountId: cloudflareAccountId.trim(),
              apiToken: cloudflareApiToken.trim(),
            }),
          },
        )
        setExplanation(result.explanation)
        setAiGenerationRequested(false)
        setArtworkNotice(
          'Code analyzed and four unique panels generated with your Cloudflare credits.',
        )
      } catch (caught) {
        const failed = await api<{ explanation: Explanation }>(
          `/api/v1/explanations/${target.id}`,
        ).catch(() => null)
        if (failed) setExplanation(failed.explanation)
        setError(
          friendlyError(
            caught instanceof Error ? caught.message : 'request_failed',
          ),
        )
      } finally {
        setAiGenerationRequested(false)
        setArtworkBusy(false)
      }
    },
    [cloudflareAccountId, cloudflareApiToken, sampleMode],
  )

  useEffect(() => {
    if (
      !pendingCloudflare.current ||
      artworkBusy ||
      explanation?.status !== 'completed' ||
      !explanation.analysis
    ) {
      return
    }
    pendingCloudflare.current = false
    void generateWithCloudflare(explanation)
  }, [artworkBusy, explanation, generateWithCloudflare])

  const clearCloudflareCredentials = () => {
    pendingCloudflare.current = false
    setAiGenerationRequested(false)
    setCloudflareAccountId('')
    setCloudflareApiToken('')
    setArtworkNotice('Credentials cleared from this browser tab.')
  }

  const removeExplanation = async () => {
    if (sampleMode) {
      setExplanation(null)
      setRepository(null)
      setSampleMode(false)
      return
    }
    if (
      !explanation ||
      !window.confirm('Delete this comic and revoke its artifact?')
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api(`/api/v1/explanations/${explanation.id}`, { method: 'DELETE' })
      setRecent((rows) => rows.filter((row) => row.id !== explanation.id))
      setExplanation(null)
      setAiGenerationRequested(false)
    } catch (caught) {
      setError(
        friendlyError(
          caught instanceof Error ? caught.message : 'request_failed',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const loadSample = () => {
    pendingCloudflare.current = false
    setSampleMode(true)
    setAiGenerationRequested(false)
    setError(null)
    setArtworkNotice(null)
    setShareNotice(null)
    setRepository(sampleRepository)
    setExplanation(sampleExplanation)
    requestAnimationFrame(() =>
      document
        .getElementById('workspace')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  return (
    <main className="site-shell" id="top">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Comic Code home">
          <BrandMark compact />
          <span>
            comic code<span className="brand-period">.</span>
          </span>
        </a>
        <div className="topbar-links">
          <a href="#workspace">Workspace</a>
          <a href="/extension">Extension preview</a>
        </div>
        <span className="user-chip">
          {localMode
            ? 'Local workspace'
            : user
              ? `@${user.login}`
              : 'Repository comics'}
          <span className="status-dot" />
        </span>
      </nav>
      <ProductMosaic
        value={repositoryUrl}
        onChange={(value) => {
          setRepositoryUrl(value)
          setRepository(null)
          setError(null)
        }}
        onInspect={inspectRepository}
        onSample={loadSample}
        busy={busy || artworkBusy}
        ready={authChecked}
        signedIn={Boolean(user)}
      />
      <section
        className="workspace"
        id="workspace"
        aria-labelledby="workspace-title"
      >
        <div className="workspace__header">
          <div>
            <h2 id="workspace-title">A little context goes a long way.</h2>
            <p>
              Inspect a repository above, or explore the sample to see how a
              story comes together.
            </p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={loadSample}
            disabled={busy || artworkBusy}
          >
            Try the sample
          </button>
        </div>
        {sampleMode ? (
          <div className="notice notice--sample" role="status">
            <strong>You’re exploring a sample.</strong>
            <p>
              Illustrative source, panels and evidence. No GitHub requests, AI
              calls or credits used.
            </p>
          </div>
        ) : null}
        {localMode ? (
          <p className="byok-privacy">
            Free structural analysis and bundled artwork. Public repositories
            only. Comics stay on this computer for 30 days; download a PNG to
            keep one. Optional Cloudflare AI uses your account’s quota.
          </p>
        ) : null}
        {localMode && recent.length ? (
          <div className="url-control">
            <label htmlFor="recent-comic">Saved comics</label>
            <select
              id="recent-comic"
              value={explanation?.id ?? ''}
              disabled={busy || artworkBusy}
              onChange={async (event) => {
                const id = event.target.value
                if (!id) {
                  setExplanation(null)
                  return
                }
                setError(null)
                setSampleMode(false)
                setBusy(true)
                try {
                  const result = await api<{ explanation: Explanation }>(
                    `/api/v1/explanations/${id}`,
                  )
                  setExplanation(result.explanation)
                } catch (caught) {
                  setError(
                    friendlyError(
                      caught instanceof Error
                        ? caught.message
                        : 'request_failed',
                    ),
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              <option value="">Choose a saved comic</option>
              {recent.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.repository} · {row.commitSha.slice(0, 7)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {error ? (
          <div className="notice notice--error" role="alert">
            <p>{error}</p>
            {error.startsWith('Install') ? (
              <a href="/api/v1/github/install">Install the GitHub App</a>
            ) : null}
          </div>
        ) : null}

        {repository ? (
          <div className="pr-card">
            <header>
              <div>
                <span className="repo-name">
                  {repository.owner}/{repository.repository} · {repository.ref}
                </span>
                <h3>
                  {repository.description || 'Repository architecture scan'}
                </h3>
              </div>
              <span className="privacy-pill">
                {sampleMode
                  ? 'Illustrative sample'
                  : repository.isPrivate
                    ? 'Private'
                    : 'Public'}
              </span>
            </header>
            <div
              className="file-list"
              aria-label="Representative files selected automatically"
            >
              {repository.representativeFiles.map((path) => (
                <div className="file-row" key={path}>
                  <code>{path}</code>
                </div>
              ))}
            </div>
            <footer>
              <span>
                {repository.selectedFileCount} representative files from{' '}
                {repository.totalFiles} repository files · commit{' '}
                {repository.commitSha.slice(0, 7)}
              </span>
              <button
                className="primary-button primary-button--amber"
                type="button"
                onClick={generate}
                disabled={busy || artworkBusy}
              >
                {sampleMode
                  ? 'Replay sample'
                  : busy
                    ? 'Preparing source preview…'
                    : explanation?.status === 'completed'
                      ? cloudflareReady && !sampleMode
                        ? 'Regenerate full AI comic'
                        : 'Regenerate fixed comic'
                      : explanation?.status === 'failed'
                        ? 'Retry generation'
                        : cloudflareReady && !sampleMode
                          ? 'Generate full AI comic'
                          : 'Generate fixed comic'}
              </button>
            </footer>
          </div>
        ) : null}

        {repository && !sampleMode ? (
          <details
            className="byok-card"
            aria-labelledby="cloudflare-setup-title"
          >
            <summary>
              <span>
                <strong>Make it your own with AI</strong>
                <small>Optional · uses your Cloudflare account</small>
              </span>
              <span aria-hidden="true">+</span>
            </summary>
            <div>
              <h3 id="cloudflare-setup-title">Connect Cloudflare</h3>
              <p>
                Leave fields empty for fixed bundled comic images. Add your
                Cloudflare Workers AI credentials for semantic code analysis and
                four unique FLUX images charged only to your account.
              </p>
            </div>
            <div className="byok-fields">
              <label htmlFor="cloudflare-account-id-setup">
                Cloudflare Account ID
                <input
                  id="cloudflare-account-id-setup"
                  value={cloudflareAccountId}
                  onChange={(event) =>
                    setCloudflareAccountId(event.target.value)
                  }
                  placeholder="32-character Account ID"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label htmlFor="cloudflare-api-token-setup">
                Workers AI API token (not Global API key)
                <input
                  id="cloudflare-api-token-setup"
                  type="password"
                  value={cloudflareApiToken}
                  onChange={(event) =>
                    setCloudflareApiToken(event.target.value)
                  }
                  placeholder="Workers AI Read + Edit token"
                  autoComplete="new-password"
                  spellCheck={false}
                />
              </label>
            </div>
            <p className="byok-privacy">
              Credentials remain in this browser tab. Masked source and
              credentials reach Cloudflare only for requested AI generation;
              Comic Code never stores them.{' '}
              <a
                href="https://developers.cloudflare.com/workers-ai/get-started/rest-api/"
                target="_blank"
                rel="noreferrer"
              >
                Create credentials
              </a>
            </p>
            <div className="byok-actions">
              {['completed', 'failed'].includes(explanation?.status ?? '') &&
              explanation?.analysis ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void generateWithCloudflare(explanation)}
                  disabled={!cloudflareReady || artworkBusy || busy}
                >
                  {artworkBusy
                    ? 'Analyzing code and generating 4 panels…'
                    : 'Analyze code + generate 4 AI panels'}
                </button>
              ) : (
                <span className="success-text">
                  {cloudflareReady
                    ? 'Key ready. Generate full AI comic above.'
                    : 'No key: fixed fallback remains available.'}
                </span>
              )}
              <button
                className="text-button"
                type="button"
                onClick={clearCloudflareCredentials}
                disabled={artworkBusy}
              >
                Clear credentials
              </button>
            </div>
            {artworkNotice ? (
              <p className="success-text" role="status">
                {artworkNotice}
              </p>
            ) : null}
          </details>
        ) : null}

        {explanation ? (
          <div className="generation-card" aria-live="polite">
            <div className="progress-heading">
              <div>
                <span className="eyebrow">{explanation.status}</span>
                <h3>
                  {aiGenerationRequested &&
                  explanation.analysis?.artworkProvider !== 'cloudflare_byok'
                    ? 'Analyzing code and generating 4 AI comic panels…'
                    : explanation.progress.message}
                </h3>
              </div>
              <strong>{explanation.progress.percent}%</strong>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={explanation.progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${explanation.progress.percent}%` }} />
            </div>
            {explanation.error ? (
              <div className="notice notice--error" role="alert">
                <p>{explanation.error}</p>
              </div>
            ) : null}
            {explanation.analysis &&
            explanation.status !== 'failed' &&
            (!aiGenerationRequested ||
              explanation.analysis.artworkProvider === 'cloudflare_byok') ? (
              <Storyboard
                sample={sampleMode}
                analysis={explanation.analysis}
                artifactUrl={explanation.artifactUrl}
              />
            ) : null}
            {explanation.analysis &&
            explanation.status !== 'failed' &&
            (!aiGenerationRequested ||
              explanation.analysis.artworkProvider === 'cloudflare_byok') ? (
              <div className="result-actions">
                {explanation.artifactUrl ? (
                  <a
                    className="primary-button"
                    href={explanation.artifactUrl}
                    download="comic-code.png"
                    referrerPolicy="no-referrer"
                  >
                    Download PNG
                  </a>
                ) : null}
                {!localMode && !sampleMode ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={createShare}
                    disabled={busy || artworkBusy}
                  >
                    Copy private share link
                  </button>
                ) : null}
                <button
                  className="text-button text-button--danger"
                  type="button"
                  disabled={busy || artworkBusy}
                  onClick={removeExplanation}
                >
                  {sampleMode ? 'Close sample' : 'Delete'}
                </button>
                {shareNotice ? (
                  <span className="success-text">{shareNotice}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <footer className="site-footer">
        <BrandMark compact />
        <p>
          Comic Code · Grounded repository explanations for people who do not
          code.
        </p>
      </footer>
    </main>
  )
}
