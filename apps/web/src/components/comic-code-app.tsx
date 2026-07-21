'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ComicAnalysis } from '@comic-code/contracts'

import { BrandMark } from '@/components/brand-mark'
import { Storyboard } from '@/components/storyboard'

type User = { id: string; login: string; avatarUrl: string | null }
type PullRequestFile = {
  path: string
  status: string
  additions: number
  deletions: number
  changes: number
}
type PullRequest = {
  owner: string
  repository: string
  pullRequestNumber: number
  title: string
  htmlUrl: string
  isPrivate: boolean
  baseSha: string
  headSha: string
  files: PullRequestFile[]
  excludedFileCount: number
  selectedChangedLines: number
}
type Explanation = {
  id: string
  repository: string
  pullRequestNumber: number
  headSha: string
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
    authentication_required: 'Connect GitHub to continue.',
    invalid_pull_request_url: 'Paste a full GitHub pull request URL.',
    pull_request_changed:
      'The pull request changed. Refresh it before generating.',
    change_too_large: 'Choose a smaller set: the limit is 3,000 changed lines.',
    daily_quota_reached:
      'Daily safety limit is 25 comics. Try again after 24 hours.',
    no_eligible_files: 'This pull request has no safe text files to explain.',
    no_executable_code:
      'This pull request changes documentation or unsupported files, not executable code. Choose a PR with source-code changes.',
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
  const data = (await response.json()) as T & {
    error?: string
    detail?: string
  }
  if (!response.ok)
    throw new Error(data.detail ?? data.error ?? 'request_failed')
  return data
}

export function ComicCodeApp() {
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [pullRequestUrl, setPullRequestUrl] = useState('')
  const [pullRequest, setPullRequest] = useState<PullRequest | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
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
    api<{ user: User | null }>('/api/v1/auth/me', {
      signal: controller.signal,
    })
      .then((result) => setUser(result.user))
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

  const inspectPullRequest = async () => {
    if (!user) {
      window.location.assign('/api/v1/auth/github/start?return_to=/')
      return
    }
    setBusy(true)
    setError(null)
    setExplanation(null)
    setAiGenerationRequested(false)
    try {
      const result = await api<{ pullRequest: PullRequest }>(
        `/api/v1/github/pull-request?url=${encodeURIComponent(pullRequestUrl)}`,
      )
      setPullRequest(result.pullRequest)
      setSelectedFiles(result.pullRequest.files.map((file) => file.path))
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

  const toggleFile = (path: string) => {
    setSelectedFiles((current) =>
      current.includes(path)
        ? current.filter((candidate) => candidate !== path)
        : [...current, path],
    )
  }

  const generate = async () => {
    if (!pullRequest || selectedFiles.length === 0) return
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
            owner: pullRequest.owner,
            repository: pullRequest.repository,
            pullRequestNumber: pullRequest.pullRequestNumber,
            headSha: pullRequest.headSha,
            selectedFiles,
            forceRegenerate: Boolean(explanation),
          }),
        },
      )
      setExplanation(result.explanation)
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
      if (!target.analysis) return
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
        setArtworkBusy(false)
      }
    },
    [cloudflareAccountId, cloudflareApiToken],
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
    if (
      !explanation ||
      !window.confirm('Delete this comic and revoke its artifact?')
    ) {
      return
    }
    await api(`/api/v1/explanations/${explanation.id}`, { method: 'DELETE' })
    setExplanation(null)
    setAiGenerationRequested(false)
  }

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Comic Code home">
          <BrandMark compact />
          <span>comic code</span>
        </a>
        <div className="topbar__meta">
          <span className="hackathon-tag">OpenAI Build Week</span>
          {authChecked && user ? (
            <span className="user-chip">@{user.login}</span>
          ) : null}
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero__copy">
          <span className="eyebrow">Pull requests · translated visually</span>
          <h1>
            See what the code <em>means.</em>
          </h1>
          <p>
            Comic Code turns selected source code in a GitHub pull request into
            a grounded four-panel story anyone can understand—without exposing
            source in storage.
          </p>
          <div className="trust-row">
            <span>Read-only GitHub App</span>
            <span>Evidence-linked claims</span>
            <span>Private by default</span>
          </div>
        </div>
        <div className="hero__orb" aria-hidden="true">
          <BrandMark />
        </div>
      </section>

      <section className="workspace" aria-labelledby="workspace-title">
        <div className="workspace__header">
          <div>
            <span className="eyebrow">Try the hosted demo</span>
            <h2 id="workspace-title">Explain a pull request</h2>
          </div>
          <span className="step-label">01 · Connect</span>
        </div>

        <div className="url-control">
          <label htmlFor="pull-request-url">GitHub pull request URL</label>
          <div>
            <input
              id="pull-request-url"
              type="url"
              value={pullRequestUrl}
              onChange={(event) => setPullRequestUrl(event.target.value)}
              placeholder="https://github.com/owner/repository/pull/123"
              autoComplete="url"
            />
            <button
              className="primary-button"
              type="button"
              onClick={inspectPullRequest}
              disabled={busy || !pullRequestUrl.trim()}
            >
              {user ? 'Inspect PR' : 'Connect GitHub'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="notice notice--error" role="alert">
            <p>{error}</p>
            {error.startsWith('Install') ? (
              <a href="/api/v1/github/install">Install the GitHub App</a>
            ) : null}
          </div>
        ) : null}

        {pullRequest ? (
          <div className="pr-card">
            <header>
              <div>
                <span className="repo-name">
                  {pullRequest.owner}/{pullRequest.repository} · #
                  {pullRequest.pullRequestNumber}
                </span>
                <h3>{pullRequest.title}</h3>
              </div>
              <span className="privacy-pill">
                {pullRequest.isPrivate ? 'Private' : 'Public'}
              </span>
            </header>
            <div
              className="file-list"
              aria-label="Files selected for explanation"
            >
              {pullRequest.files.map((file) => (
                <label className="file-row" key={file.path}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.includes(file.path)}
                    onChange={() => toggleFile(file.path)}
                  />
                  <code>{file.path}</code>
                  <span className="diff-count">
                    <b>+{file.additions}</b> −{file.deletions}
                  </span>
                </label>
              ))}
            </div>
            <footer>
              <span>
                {selectedFiles.length} source files selected · current PR-head
                code will be analyzed
              </span>
              <button
                className="primary-button primary-button--amber"
                type="button"
                onClick={generate}
                disabled={busy || selectedFiles.length === 0}
              >
                {busy
                  ? 'Preparing source preview…'
                  : explanation?.status === 'completed'
                    ? cloudflareReady
                      ? 'Regenerate full AI comic'
                      : 'Regenerate fixed comic'
                    : explanation?.status === 'failed'
                      ? 'Retry generation'
                      : cloudflareReady
                        ? 'Generate full AI comic'
                        : 'Generate fixed comic'}
              </button>
            </footer>
          </div>
        ) : null}

        {pullRequest ? (
          <section
            className="byok-card"
            aria-labelledby="cloudflare-setup-title"
          >
            <div>
              <span className="eyebrow">02 · Choose image mode</span>
              <h3 id="cloudflare-setup-title">Your image-generation key</h3>
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
                  disabled={!cloudflareReady || artworkBusy}
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
          </section>
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
                <button
                  className="secondary-button"
                  type="button"
                  onClick={createShare}
                >
                  Copy private share link
                </button>
                <button
                  className="text-button text-button--danger"
                  type="button"
                  onClick={removeExplanation}
                >
                  Delete
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
        <p>Comic Code · Grounded AI explanations for people beyond the diff.</p>
      </footer>
    </main>
  )
}
