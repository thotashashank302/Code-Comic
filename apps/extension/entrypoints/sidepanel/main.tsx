import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import type { ComicAnalysis } from '@comic-code/contracts'
import { parseGitHubRepositoryUrl } from '@comic-code/contracts/repository-url'

import { BrandGlyph } from './brand-glyph'
import './style.css'

type Coordinate = {
  owner: string
  repository: string
  ref?: string
}
type Repository = Coordinate & {
  description: string
  htmlUrl: string
  isPrivate: boolean
  defaultBranch: string
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
  scanSummary: Record<string, unknown>
  status: string
  progress: { percent: number; message: string; updatedAt: string }
  analysis: ComicAnalysis | null
  artifactUrl: string | null
  errorCode: string | null
  error: string | null
}
type StoredState = {
  comicCodeCoordinate?: Coordinate
  comicCodeSession?: string
  comicCodeCompact?: boolean
  comicCodeCloudflareAccountId?: string
  comicCodeCloudflareApiToken?: string
  comicCodeExplanationIds?: Record<string, string>
}
type Tab = 'explain' | 'story' | 'evidence'

const configuredApiBase = import.meta.env.WXT_PUBLIC_API_BASE_URL?.trim()

if (!configuredApiBase && import.meta.env.PROD) {
  throw new Error(
    'WXT_PUBLIC_API_BASE_URL is required for production extension builds',
  )
}

const apiBase = (configuredApiBase || 'http://localhost:3000').replace(
  /\/$/,
  '',
)
const terminalStatuses = new Set(['completed', 'failed', 'canceled', 'deleted'])
function coordinateKey(coordinate: Coordinate) {
  return JSON.stringify([
    coordinate.owner.toLowerCase(),
    coordinate.repository.toLowerCase(),
    coordinate.ref ?? null,
  ])
}

async function persistExplanationId(
  coordinate: Coordinate,
  explanationId: string,
) {
  const stored = (await chrome.storage.local.get(
    'comicCodeExplanationIds',
  )) as Pick<StoredState, 'comicCodeExplanationIds'>
  await chrome.storage.local.set({
    comicCodeExplanationIds: {
      ...stored.comicCodeExplanationIds,
      [coordinateKey(coordinate)]: explanationId,
    },
  })
}

async function removePersistedExplanationId(coordinate: Coordinate) {
  const stored = (await chrome.storage.local.get(
    'comicCodeExplanationIds',
  )) as Pick<StoredState, 'comicCodeExplanationIds'>
  const explanationIds = { ...stored.comicCodeExplanationIds }
  delete explanationIds[coordinateKey(coordinate)]
  await chrome.storage.local.set({
    comicCodeExplanationIds: explanationIds,
  })
}

function parseRepositoryUrl(value: string | undefined): Coordinate | null {
  return value ? parseGitHubRepositoryUrl(value) : null
}

function friendlyError(value: string) {
  if (
    value.startsWith('Cloudflare Workers AI ') ||
    value.startsWith('Comic Code image runtime error:') ||
    value.startsWith('Comic Code artwork error during ')
  ) {
    return value
  }
  const messages: Record<string, string> = {
    authentication_required: 'Connect GitHub to explain this repository.',
    repository_changed:
      'This repository branch moved. Inspect it again before generating.',
    daily_quota_reached: 'You reached the 25-comic daily safety limit.',
    invalid_repository_url: 'Open a full GitHub repository URL.',
    no_executable_code:
      'This repository has no safe, readable source files to explain.',
    github_reconnect_required:
      'Your GitHub login expired. Reconnect GitHub, then try again.',
    github_access_denied:
      'GitHub denied repository access. Check account and App permissions.',
    repository_not_found:
      'GitHub could not find this repository or your account cannot access it.',
    github_app_installation_required:
      'Install Comic Code on this private repository, then try again.',
    invalid_image_provider_credentials:
      'Enter a valid Cloudflare Account ID and Workers AI token.',
    image_provider_auth_failed:
      'Cloudflare rejected these credentials. Check token permissions.',
    image_provider_quota_reached:
      'Your Cloudflare Workers AI limit is exhausted.',
    image_provider_unavailable:
      'Cloudflare image generation is unavailable. Existing comic is safe.',
    cloudflare_analysis_failed:
      'Cloudflare could not create a grounded code explanation. Check Workers AI and retry.',
    explanation_not_ready:
      'Wait for the template comic to finish before generating AI artwork.',
  }
  return (
    messages[value] ?? 'Comic Code could not complete that request. Try again.'
  )
}

async function requestApi<T>(
  path: string,
  session: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${session}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
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

function SidePanelShell() {
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null)
  const [session, setSession] = useState<string | null>(null)
  const [repository, setRepository] = useState<Repository | null>(null)
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('explain')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [compact, setCompact] = useState(false)
  const [panelSide, setPanelSide] = useState<'left' | 'right' | 'unknown'>(
    'unknown',
  )
  const [cloudflareAccountId, setCloudflareAccountId] = useState('')
  const [cloudflareApiToken, setCloudflareApiToken] = useState('')
  const [artworkBusy, setArtworkBusy] = useState(false)
  const [aiGenerationRequested, setAiGenerationRequested] = useState(false)
  const pendingCloudflare = useRef(false)
  const cloudflareReady =
    cloudflareAccountId.trim().length === 32 &&
    cloudflareApiToken.trim().length >= 20

  useEffect(() => {
    let active = true
    const initialize = async () => {
      const stored = (await chrome.storage.local.get([
        'comicCodeCoordinate',
        'comicCodeSession',
        'comicCodeCompact',
        'comicCodeCloudflareAccountId',
        'comicCodeCloudflareApiToken',
      ])) as StoredState
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      const tabCoordinate = parseRepositoryUrl(tab?.url)
      if (!active) return
      setCoordinate(tabCoordinate ?? stored.comicCodeCoordinate ?? null)
      setSession(stored.comicCodeSession ?? null)
      setCompact(stored.comicCodeCompact ?? false)
      setCloudflareAccountId(stored.comicCodeCloudflareAccountId ?? '')
      setCloudflareApiToken(stored.comicCodeCloudflareApiToken ?? '')

      const sidePanel = chrome.sidePanel as typeof chrome.sidePanel & {
        getLayout?: () => Promise<{ side: 'left' | 'right' }>
      }
      if (sidePanel.getLayout) {
        const layout = await sidePanel.getLayout().catch(() => null)
        if (active && layout) setPanelSide(layout.side)
      }
    }
    void initialize()

    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'local' && changes.comicCodeCoordinate?.newValue) {
        setCoordinate(changes.comicCodeCoordinate.newValue as Coordinate)
        setRepository(null)
        setExplanation(null)
        setAiGenerationRequested(false)
        setActiveTab('explain')
      }
    }
    chrome.storage.onChanged.addListener(storageListener)
    return () => {
      active = false
      chrome.storage.onChanged.removeListener(storageListener)
    }
  }, [])

  useEffect(() => {
    if (!coordinate || !session) return
    let active = true
    const inspect = async () => {
      setBusy(true)
      setError(null)
      const url = `https://github.com/${coordinate.owner}/${coordinate.repository}${coordinate.ref ? `/tree/${coordinate.ref.split('/').map(encodeURIComponent).join('/')}` : ''}`
      try {
        const result = await requestApi<{ repository: Repository }>(
          `/api/v1/github/repository?url=${encodeURIComponent(url)}`,
          session,
        )
        if (active) {
          setRepository(result.repository)

          const stored = (await chrome.storage.local.get(
            'comicCodeExplanationIds',
          )) as Pick<StoredState, 'comicCodeExplanationIds'>
          const persistedId =
            stored.comicCodeExplanationIds?.[coordinateKey(coordinate)]
          if (persistedId) {
            const recovered = await requestApi<{ explanation: Explanation }>(
              `/api/v1/explanations/${persistedId}`,
              session,
            ).catch(() => null)
            if (
              active &&
              recovered &&
              recovered.explanation.ref === result.repository.ref &&
              recovered.explanation.repository.toLowerCase() ===
                `${coordinate.owner}/${coordinate.repository}`.toLowerCase()
            ) {
              setExplanation(recovered.explanation)
              if (
                recovered.explanation.analysis &&
                recovered.explanation.status !== 'failed'
              ) {
                setActiveTab('story')
              }
            } else if (recovered) {
              await removePersistedExplanationId(coordinate)
            }
          }
        }
      } catch (caught) {
        if (active) {
          const code =
            caught instanceof Error ? caught.message : 'request_failed'
          if (code === 'authentication_required') {
            setSession(null)
            void chrome.storage.local.remove('comicCodeSession')
          }
          setError(friendlyError(code))
        }
      } finally {
        if (active) setBusy(false)
      }
    }
    void inspect()
    return () => {
      active = false
    }
  }, [coordinate, session])

  const explanationId = explanation?.id
  const explanationStatus = explanation?.status
  useEffect(() => {
    if (
      !coordinate ||
      !session ||
      !explanationId ||
      !explanationStatus ||
      terminalStatuses.has(explanationStatus)
    ) {
      return
    }
    let active = true
    const refresh = async () => {
      try {
        const result = await requestApi<{ explanation: Explanation }>(
          `/api/v1/explanations/${explanationId}`,
          session,
        )
        if (active) {
          setExplanation(result.explanation)
          void persistExplanationId(coordinate, result.explanation.id)
          if (
            result.explanation.analysis &&
            (!pendingCloudflare.current ||
              result.explanation.analysis.artworkProvider === 'cloudflare_byok')
          ) {
            setActiveTab('story')
          }
        }
      } catch {
        // A later poll can recover from a transient network failure.
      }
    }
    const interval = window.setInterval(refresh, 2_500)
    void refresh()
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [coordinate, explanationId, explanationStatus, session])

  useEffect(() => {
    if (
      !session ||
      !explanationId ||
      explanationStatus !== 'completed' ||
      !explanation?.artifactUrl
    ) {
      return
    }
    const refreshArtifact = async () => {
      const result = await requestApi<{ explanation: Explanation }>(
        `/api/v1/explanations/${explanationId}`,
        session,
      ).catch(() => null)
      if (result) setExplanation(result.explanation)
    }
    const interval = window.setInterval(refreshArtifact, 4 * 60 * 1_000)
    return () => window.clearInterval(interval)
  }, [explanation?.artifactUrl, explanationId, explanationStatus, session])

  const connectGitHub = async () => {
    setError(null)
    const redirectUrl = chrome.identity.getRedirectURL('comic-code')
    const authUrl = `${apiBase}/api/v1/auth/github/start?extension_redirect=${encodeURIComponent(redirectUrl)}`
    try {
      const finalUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true,
      })
      if (!finalUrl) throw new Error('authentication_required')
      const token = new URLSearchParams(new URL(finalUrl).hash.slice(1)).get(
        'session',
      )
      if (!token) throw new Error('authentication_required')
      await chrome.storage.local.set({ comicCodeSession: token })
      setSession(token)
    } catch (caught) {
      setError(
        friendlyError(
          caught instanceof Error ? caught.message : 'request_failed',
        ),
      )
    }
  }

  const generate = async () => {
    if (!session || !repository) return
    setBusy(true)
    setError(null)
    setNotice(null)
    pendingCloudflare.current = cloudflareReady
    setAiGenerationRequested(cloudflareReady)
    try {
      if (cloudflareReady) {
        await chrome.storage.local.set({
          comicCodeCloudflareAccountId: cloudflareAccountId.trim(),
          comicCodeCloudflareApiToken: cloudflareApiToken.trim(),
        })
      }
      const result = await requestApi<{ explanation: Explanation }>(
        '/api/v1/explanations',
        session,
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
      if (coordinate)
        void persistExplanationId(coordinate, result.explanation.id)
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
    if (!session || !explanation) return
    try {
      const result = await requestApi<{ share: { url: string } }>(
        `/api/v1/explanations/${explanation.id}/shares`,
        session,
        { method: 'POST' },
      )
      await navigator.clipboard.writeText(result.share.url)
      setNotice('Private 7-day link copied')
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
      if (!session || !target.analysis) return
      setAiGenerationRequested(true)
      setArtworkBusy(true)
      setError(null)
      setNotice(null)
      await chrome.storage.local.set({
        comicCodeCloudflareAccountId: cloudflareAccountId.trim(),
        comicCodeCloudflareApiToken: cloudflareApiToken.trim(),
      })
      try {
        const result = await requestApi<{ explanation: Explanation }>(
          `/api/v1/explanations/${target.id}/artwork`,
          session,
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
        if (coordinate) {
          void persistExplanationId(coordinate, result.explanation.id)
        }
        setAiGenerationRequested(false)
        setActiveTab('story')
        setNotice(
          'Code analyzed and four panels generated with your Cloudflare credits',
        )
      } catch (caught) {
        const failed = await requestApi<{ explanation: Explanation }>(
          `/api/v1/explanations/${target.id}`,
          session,
        ).catch(() => null)
        if (failed) {
          setExplanation(failed.explanation)
          setActiveTab(
            failed.explanation.status === 'completed' &&
              failed.explanation.analysis
              ? 'story'
              : 'explain',
          )
        } else {
          setActiveTab('explain')
        }
        setError(
          friendlyError(
            caught instanceof Error ? caught.message : 'request_failed',
          ),
        )
      } finally {
        setArtworkBusy(false)
      }
    },
    [cloudflareAccountId, cloudflareApiToken, coordinate, session],
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

  const clearCloudflareCredentials = async () => {
    pendingCloudflare.current = false
    setAiGenerationRequested(false)
    await chrome.storage.local.remove([
      'comicCodeCloudflareAccountId',
      'comicCodeCloudflareApiToken',
    ])
    setCloudflareAccountId('')
    setCloudflareApiToken('')
    setNotice('Cloudflare credentials removed from this device')
  }

  const toggleCompact = async () => {
    const next = !compact
    setCompact(next)
    await chrome.storage.local.set({ comicCodeCompact: next })
  }

  const logout = async () => {
    await chrome.storage.local.remove('comicCodeSession')
    setSession(null)
    setRepository(null)
    setExplanation(null)
    setAiGenerationRequested(false)
  }

  return (
    <main
      className={compact ? 'panel-shell panel-shell--compact' : 'panel-shell'}
      data-side={panelSide}
    >
      <header className="panel-header">
        <div className="panel-brand">
          <span className="glyph">
            <BrandGlyph />
          </span>
          <div>
            <strong>Comic Code</strong>
            <small>Repositories, translated visually</small>
          </div>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={toggleCompact}
          title="Toggle compact layout"
        >
          {compact ? '↗' : '↙'}
        </button>
      </header>

      {coordinate ? (
        <section className="pr-heading">
          <span className="repo-label">
            {coordinate.owner}/{coordinate.repository}
          </span>
          <div>
            <strong>Repository architecture</strong>
            <span className="live-dot">Live</span>
          </div>
          {repository?.description ? <p>{repository.description}</p> : null}
        </section>
      ) : (
        <section className="empty-state">
          <span className="empty-glyph">
            <BrandGlyph />
          </span>
          <h1>Open a GitHub repository.</h1>
          <p>
            Comic Code maps its important parts and explains them as one system.
          </p>
        </section>
      )}

      {coordinate ? (
        <nav className="panel-tabs" aria-label="Comic Code sections">
          {(['explain', 'story', 'evidence'] as const).map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab(tab)}
              disabled={
                tab !== 'explain' &&
                (!explanation?.analysis || explanation.status === 'failed')
              }
            >
              {tab}
            </button>
          ))}
        </nav>
      ) : null}

      {coordinate && !session ? (
        <section className="connect-card">
          <span className="eyebrow">Read-only access</span>
          <h1>Connect GitHub once.</h1>
          <p>
            Private repositories stay private. Source is filtered in memory and
            never saved.
          </p>
          <button
            className="primary-action"
            type="button"
            onClick={connectGitHub}
          >
            Continue with GitHub
          </button>
        </section>
      ) : null}

      {error ? (
        <div className="panel-notice panel-notice--error" role="alert">
          <p>{error}</p>
          {error.startsWith('Install') ? (
            <button
              type="button"
              onClick={() =>
                void chrome.tabs.create({
                  url: `${apiBase}/api/v1/github/install`,
                })
              }
            >
              Install GitHub App
            </button>
          ) : null}
        </div>
      ) : null}

      {coordinate && session && activeTab === 'explain' ? (
        <section className="panel-content">
          {repository ? (
            <>
              <div className="section-title">
                <div>
                  <span className="eyebrow">Repository scan</span>
                  <h2>Representative architecture</h2>
                </div>
                <span>{repository.selectedFileCount} files</span>
              </div>
              <div className="side-file-list">
                {repository.representativeFiles.map((path) => (
                  <div className="side-file" key={path}>
                    <code>{path}</code>
                  </div>
                ))}
              </div>
              <section
                className="side-byok"
                aria-labelledby="side-cloudflare-title"
              >
                <span className="eyebrow">Choose image mode</span>
                <h2 id="side-cloudflare-title">Your image-generation key</h2>
                <p>
                  No key gives a fixed, API-free comic. Add your Cloudflare
                  Workers AI key for semantic code analysis and four unique FLUX
                  images charged only to your account.
                </p>
                <label>
                  Cloudflare Account ID
                  <input
                    value={cloudflareAccountId}
                    onChange={(event) =>
                      setCloudflareAccountId(event.target.value)
                    }
                    placeholder="32-character Account ID"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Workers AI API token (not Global API key)
                  <input
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
                <small>
                  Saved only in extension local storage. Credentials and masked
                  source go to Cloudflare only when you request AI generation;
                  Comic Code never stores them on its server.
                </small>
                <a
                  href="https://developers.cloudflare.com/workers-ai/get-started/rest-api/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Create Cloudflare credentials
                </a>
                {['completed', 'failed'].includes(explanation?.status ?? '') &&
                explanation?.analysis ? (
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => void generateWithCloudflare(explanation)}
                    disabled={!cloudflareReady || artworkBusy}
                  >
                    {artworkBusy
                      ? 'Analyzing code + generating 4 panels…'
                      : 'Analyze code + generate 4 AI panels'}
                  </button>
                ) : (
                  <p className="side-byok__status">
                    {cloudflareReady
                      ? 'Key ready. Full AI comic will run after source scan.'
                      : 'No key: fixed fallback remains available.'}
                  </p>
                )}
                <button
                  className="side-byok__clear"
                  type="button"
                  onClick={clearCloudflareCredentials}
                  disabled={artworkBusy}
                >
                  Remove saved credentials
                </button>
              </section>
              <button
                className="primary-action primary-action--amber"
                type="button"
                onClick={generate}
                disabled={busy}
              >
                {busy
                  ? 'Preparing source preview…'
                  : explanation?.status === 'completed'
                    ? cloudflareReady
                      ? 'Regenerate full AI comic'
                      : 'Regenerate fixed comic'
                    : explanation?.status === 'failed'
                      ? 'Retry explanation'
                      : cloudflareReady
                        ? 'Generate full AI comic'
                        : 'Generate fixed comic'}
              </button>
              <div className="privacy-note">
                <span>✦</span>
                <p>
                  Scans repository tree, then reads up to 40 representative
                  files at commit {repository.commitSha.slice(0, 7)}. Secrets,
                  binaries, dependencies, and generated files stay excluded.
                </p>
              </div>
            </>
          ) : (
            <div className="loading-state">
              <span /> Mapping repository architecture…
            </div>
          )}

          {explanation ? (
            <div className="side-progress" aria-live="polite">
              <header>
                <div>
                  <span className="eyebrow">{explanation.status}</span>
                  <strong>
                    {aiGenerationRequested &&
                    explanation.analysis?.artworkProvider !== 'cloudflare_byok'
                      ? 'Analyzing code + generating 4 AI panels…'
                      : explanation.progress.message}
                  </strong>
                </div>
                <b>{explanation.progress.percent}%</b>
              </header>
              <div
                role="progressbar"
                aria-valuenow={explanation.progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${explanation.progress.percent}%` }} />
              </div>
              {explanation.error ? (
                <div className="panel-notice panel-notice--error" role="alert">
                  <p>{explanation.error}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {coordinate &&
      session &&
      activeTab === 'story' &&
      explanation?.status !== 'failed' &&
      explanation?.analysis ? (
        <section className="panel-content story-content">
          {explanation.analysis.generationMode === 'deterministic_fallback' ? (
            <p className="panel-notice panel-notice--fallback">
              <strong>
                {explanation.analysis.artworkProvider === 'cloudflare_byok'
                  ? 'API-free story · user-funded AI artwork.'
                  : 'API-free template mode.'}
              </strong>{' '}
              Story explains selected source code without an OpenAI API call.
              {explanation.analysis.artworkProvider === 'cloudflare_byok'
                ? ' Images use your Cloudflare credits.'
                : ' Images use bundled templates.'}{' '}
              Add your key in Explain for semantic analysis and unique images.
            </p>
          ) : null}
          {explanation.artifactUrl ? (
            <img
              src={explanation.artifactUrl}
              alt="Generated four-panel repository comic"
              referrerPolicy="no-referrer"
            />
          ) : null}
          {explanation.analysis.panels.map((panel) => (
            <article className="side-story" key={panel.sequence}>
              <header>
                <span>0{panel.sequence}</span>
                <small>{panel.purpose}</small>
              </header>
              <h2>{panel.title}</h2>
              <p>{panel.caption}</p>
              {panel.uncertaintyNote ? <em>{panel.uncertaintyNote}</em> : null}
            </article>
          ))}
          <div className="story-actions">
            {explanation.artifactUrl ? (
              <a
                className="primary-action"
                href={explanation.artifactUrl}
                download="comic-code.png"
                referrerPolicy="no-referrer"
              >
                Download PNG
              </a>
            ) : null}
            <button
              className="secondary-action"
              type="button"
              onClick={createShare}
            >
              Copy share link
            </button>
          </div>
          {notice ? (
            <p className="panel-notice panel-notice--success">{notice}</p>
          ) : null}
        </section>
      ) : null}

      {coordinate &&
      session &&
      activeTab === 'evidence' &&
      explanation?.analysis ? (
        <section className="panel-content">
          <div className="section-title">
            <div>
              <span className="eyebrow">Traceable claims</span>
              <h2>Evidence map</h2>
            </div>
            <span>{explanation.analysis.evidence.length}</span>
          </div>
          <div className="side-evidence">
            {explanation.analysis.evidence.map((evidence) => (
              <div key={evidence.id}>
                <code>{evidence.filePath ?? evidence.source}</code>
                <small>
                  {evidence.newStart
                    ? `Lines ${evidence.newStart}–${evidence.newEnd}`
                    : 'Repository context'}{' '}
                  · {evidence.id}
                </small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="panel-footer">
        <button
          type="button"
          onClick={() =>
            void chrome.tabs.create({ url: 'chrome://settings/appearance' })
          }
        >
          Panel: {panelSide === 'unknown' ? 'browser setting' : panelSide} ·
          move in Chrome Appearance
        </button>
        {session ? (
          <button type="button" onClick={logout}>
            Sign out
          </button>
        ) : null}
      </footer>
    </main>
  )
}

const root = document.getElementById('root')

if (!root) {
  throw new Error('Missing Comic Code side-panel root')
}

createRoot(root).render(
  <React.StrictMode>
    <SidePanelShell />
  </React.StrictMode>,
)
