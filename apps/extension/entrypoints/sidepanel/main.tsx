import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  hasByokArtwork,
  imageProviders,
  type ImageProvider,
} from '@comic-code/contracts/image-providers'

import type { ComicAnalysis } from '@comic-code/contracts'
import {
  getSampleRepository,
  getSampleExplanation,
} from '@comic-code/comic/sample'
import type { PanelCount } from '@comic-code/contracts/comic-layout'
import { ManualArtwork } from '@comic-code/ui'
import '@comic-code/ui/styles.css'
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
    value.startsWith('Comic Code image runtime error:') ||
    value.startsWith('Comic Code artwork error during ')
  ) {
    return value
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
      'Choose an image provider, model and valid API key.',
    image_provider_auth_failed:
      'The image provider rejected this key. Check the provider and key permissions.',
    image_provider_quota_reached:
      'Your image provider quota or rate limit was reached. Check billing and credits.',
    image_provider_unavailable:
      'The image provider is unavailable. Your existing comic is safe.',
    image_provider_model_unavailable:
      'This image model is unavailable to your key. Choose another model or check account access.',
    image_provider_rejected:
      'The image request was rejected. Check your key and model access, or try a different image model.',
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
  const result = data as T & { explanation?: Explanation }
  if (result.explanation?.artifactUrl) {
    result.explanation.artifactUrl = new URL(
      result.explanation.artifactUrl,
      apiBase,
    ).href
  }
  return result
}

const previewDocument =
  new URLSearchParams(window.location.search).get('preview') === '1'

function bundledSampleFor(count: PanelCount) {
  const sample = getSampleExplanation(count)
  return {
    ...sample,
    artifactUrl: new URL(
      sample.artifactUrl,
      previewDocument ? window.location.origin : apiBase,
    ).href,
  }
}

function SidePanelShell() {
  const [sampleMode, setSampleMode] = useState(previewDocument)
  const [panelCount, setPanelCount] = useState<PanelCount>(12)
  const [coordinate, setCoordinate] = useState<Coordinate | null>(
    previewDocument ? getSampleRepository(12) : null,
  )
  const [session, setSession] = useState<string | null>(
    previewDocument ? 'sample-preview' : null,
  )
  const [localMode, setLocalMode] = useState(previewDocument)
  const [repository, setRepository] = useState<Repository | null>(
    previewDocument ? getSampleRepository(12) : null,
  )
  const [explanation, setExplanation] = useState<Explanation | null>(
    previewDocument ? bundledSampleFor(12) : null,
  )
  const [activeTab, setActiveTab] = useState<Tab>('explain')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [compact, setCompact] = useState(false)
  const [panelSide, setPanelSide] = useState<'left' | 'right' | 'unknown'>(
    'unknown',
  )
  const [imageProvider, setImageProvider] = useState<ImageProvider>('openai')
  const [imageModel, setImageModel] = useState<string>(
    imageProviders.openai.models[0],
  )
  const [imageApiKey, setImageApiKey] = useState('')
  const [artworkBusy, setArtworkBusy] = useState(false)
  const [aiGenerationRequested, setAiGenerationRequested] = useState(false)
  const pendingImage = useRef(false)
  const imageReady =
    imageApiKey.trim().length >= 20 &&
    imageApiKey.trim().length <= 2_048 &&
    !/\s/.test(imageApiKey.trim())

  const activePanelCount = explanation?.analysis?.panels.length ?? panelCount

  useEffect(() => {
    if (sampleMode) return
    let active = true
    const initialize = async () => {
      const stored = (await chrome.storage.local.get([
        'comicCodeCoordinate',
        'comicCodeSession',
        'comicCodeCompact',
      ])) as StoredState
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      const tabCoordinate = parseRepositoryUrl(tab?.url)
      if (!active) return
      setCoordinate(tabCoordinate ?? stored.comicCodeCoordinate ?? null)
      const runtime = await requestApi<{ mode?: string }>(
        '/api/v1/auth/me',
        '',
      ).catch(() => null)
      if (!active) return
      const local = runtime?.mode === 'local'
      setLocalMode(local)
      setSession(local ? 'local-desktop' : (stored.comicCodeSession ?? null))
      setCompact(stored.comicCodeCompact ?? false)
      // Remove obsolete provider credentials instead of reusing them as new keys.
      await chrome.storage.local.remove([
        'comicCodeCloudflareAccountId',
        'comicCodeCloudflareApiToken',
      ])

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
  }, [sampleMode])

  useEffect(() => {
    if (sampleMode || !coordinate || !session) return
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
  }, [coordinate, session, sampleMode])

  const explanationId = explanation?.id
  const explanationStatus = explanation?.status
  useEffect(() => {
    if (
      sampleMode ||
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
            (!pendingImage.current ||
              hasByokArtwork(result.explanation.analysis.artworkProvider))
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
  }, [coordinate, explanationId, explanationStatus, session, sampleMode])

  useEffect(() => {
    if (
      sampleMode ||
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
  }, [
    explanation?.artifactUrl,
    explanationId,
    explanationStatus,
    session,
    sampleMode,
  ])

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
    if (sampleMode) {
      setExplanation(bundledSampleFor(panelCount))
      setActiveTab('story')
      setNotice('Illustrative sample · no API requests or credits used.')
      return
    }
    if (!session || !repository) return
    setBusy(true)
    setError(null)
    setNotice(null)
    pendingImage.current = imageReady
    setAiGenerationRequested(imageReady)
    try {
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
            panelCount,
          }),
        },
      )
      setExplanation(result.explanation)
      if (coordinate)
        void persistExplanationId(coordinate, result.explanation.id)
    } catch (caught) {
      pendingImage.current = false
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

  const generateWithImageProvider = useCallback(
    async (target: Explanation) => {
      if (sampleMode || !session || !target.analysis) return
      setAiGenerationRequested(true)
      setArtworkBusy(true)
      setError(null)
      setNotice(null)
      try {
        const result = await requestApi<{ explanation: Explanation }>(
          `/api/v1/explanations/${target.id}/artwork`,
          session,
          {
            method: 'POST',
            body: JSON.stringify({
              provider: imageProvider,
              model: imageModel,
              apiKey: imageApiKey.trim(),
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
          `${target.analysis.panels.length} AI panels ready. Captions and evidence are unchanged.`,
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
        setAiGenerationRequested(false)
        setArtworkBusy(false)
      }
    },
    [imageProvider, imageModel, imageApiKey, coordinate, session, sampleMode],
  )

  useEffect(() => {
    if (
      !pendingImage.current ||
      artworkBusy ||
      explanation?.status !== 'completed' ||
      !explanation.analysis
    ) {
      return
    }
    pendingImage.current = false
    void generateWithImageProvider(explanation)
  }, [artworkBusy, explanation, generateWithImageProvider])

  const clearImageCredentials = async () => {
    pendingImage.current = false
    setAiGenerationRequested(false)
    setImageApiKey('')
    setNotice('API key cleared from this panel')
  }

  const toggleCompact = async () => {
    const next = !compact
    setCompact(next)
    if (!sampleMode) await chrome.storage.local.set({ comicCodeCompact: next })
  }

  const logout = async () => {
    await chrome.storage.local.remove('comicCodeSession')
    pendingImage.current = false
    setImageApiKey('')
    setSession(null)
    setRepository(null)
    setExplanation(null)
    setAiGenerationRequested(false)
  }

  const loadSample = () => {
    pendingImage.current = false
    setSampleMode(true)
    setLocalMode(true)
    setCoordinate(getSampleRepository(panelCount))
    setRepository(getSampleRepository(panelCount))
    setExplanation(bundledSampleFor(panelCount))
    setSession('sample-preview')
    setActiveTab('explain')
    setError(null)
    setNotice(null)
    setBusy(false)
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
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d={
                compact
                  ? 'M8 3H3v5m0-5 7 7m6 11h5v-5m0 5-7-7'
                  : 'M3 8h5V3m0 5L2 2m19 14h-5v5m0-5 6 6'
              }
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div className="sample-switch">
        {sampleMode ? (
          <>
            <span className="sample-indicator">Sample workspace</span>
            <small>No API calls · no credits</small>
            {!previewDocument ? (
              <button type="button" onClick={() => window.location.reload()}>
                Back to current tab
              </button>
            ) : null}
          </>
        ) : (
          <>
            <span>Just looking around?</span>
            <button
              type="button"
              disabled={busy || artworkBusy}
              onClick={loadSample}
            >
              Explore sample
            </button>
          </>
        )}
      </div>
      <div className="story-length">
        <label htmlFor="side-panel-count">Story length for new comics</label>
        <select
          id="side-panel-count"
          value={panelCount}
          disabled={busy || artworkBusy}
          onChange={(event) => {
            const count = Number(event.target.value) as PanelCount
            setPanelCount(count)
            pendingImage.current = false
            setAiGenerationRequested(false)
            if (sampleMode) {
              setCoordinate(getSampleRepository(count))
              setRepository(getSampleRepository(count))
              setExplanation(bundledSampleFor(count))
            }
          }}
        >
          <option value="12">12 panels · detailed walkthrough</option>
          <option value="4">4 panels · quick overview</option>
        </select>
      </div>
      <details className="side-byok" aria-labelledby="side-image-title">
        <summary>
          <strong>API key / BYOK</strong>
          <span aria-hidden="true">+</span>
        </summary>
        <h2 id="side-image-title">Bring your own image AI</h2>
        <p>
          Use OpenAI or Google Gemini to generate {activePanelCount}{' '}
          illustrations with your own key. Captions and evidence stay unchanged.
          No key uses free bundled artwork.
        </p>
        {sampleMode ? (
          <p role="status">
            Preview only. Choose a provider to see its models. Key entry is
            disabled in sample mode.
          </p>
        ) : null}
        <label>
          Image provider
          <select
            value={imageProvider}
            disabled={busy || artworkBusy}
            onChange={(event) => {
              pendingImage.current = false
              setAiGenerationRequested(false)
              const provider = event.target.value as ImageProvider
              setImageProvider(provider)
              setImageModel(imageProviders[provider].models[0])
              setImageApiKey('')
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </label>
        <label>
          Image model
          <select
            value={imageModel}
            disabled={busy || artworkBusy}
            onChange={(event) => {
              pendingImage.current = false
              setAiGenerationRequested(false)
              setImageModel(event.target.value)
            }}
          >
            {imageProviders[imageProvider].models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label>
          {imageProviders[imageProvider].label} API key
          <input
            type="password"
            value={imageApiKey}
            onChange={(event) => {
              pendingImage.current = false
              setAiGenerationRequested(false)
              setImageApiKey(event.target.value)
            }}
            placeholder="Paste your provider API key"
            maxLength={2048}
            disabled={sampleMode || busy || artworkBusy}
            autoComplete="new-password"
            spellCheck={false}
          />
        </label>
        <small>
          The key stays in this panel until it closes or you clear it. It passes
          through Comic Code for generation and is never saved. Only
          illustration prompts go to the selected provider. {activePanelCount}{' '}
          images use your provider’s quota and billing.
        </small>
        <a
          href={imageProviders[imageProvider].keyUrl}
          target="_blank"
          rel="noreferrer"
        >
          Get a key from {imageProviders[imageProvider].label}
        </a>
        {!sampleMode &&
        ['completed', 'failed'].includes(explanation?.status ?? '') &&
        explanation?.analysis ? (
          <button
            className="primary-action"
            type="button"
            onClick={() => void generateWithImageProvider(explanation)}
            disabled={!imageReady || artworkBusy || busy}
          >
            {artworkBusy
              ? `Generating ${activePanelCount} AI panels…`
              : `Generate ${activePanelCount} AI panels`}
          </button>
        ) : (
          <p className="side-byok__status" role="status">
            {sampleMode
              ? 'Sample mode never uses or saves keys.'
              : imageReady
                ? 'Key entered. Generate a comic to use your image AI.'
                : 'No key: free bundled artwork remains available.'}
          </p>
        )}
        <button
          className="side-byok__clear"
          type="button"
          onClick={clearImageCredentials}
          disabled={sampleMode || artworkBusy || busy}
        >
          Clear API key
        </button>
      </details>
      {coordinate ? (
        <section className="pr-heading">
          <span className="repo-label">
            {coordinate.owner}/{coordinate.repository}
          </span>
          <div>
            <strong>Repository architecture</strong>
            <span className="live-dot">{sampleMode ? 'Sample' : 'Live'}</span>
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
              aria-pressed={activeTab === tab}
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

              <button
                className="primary-action primary-action--amber"
                type="button"
                onClick={generate}
                disabled={busy || artworkBusy}
              >
                {sampleMode
                  ? 'View sample story'
                  : busy
                    ? 'Preparing source preview…'
                    : explanation?.status === 'completed'
                      ? imageReady
                        ? 'Regenerate comic with AI images'
                        : 'Regenerate fixed comic'
                      : explanation?.status === 'failed'
                        ? 'Retry explanation'
                        : imageReady
                          ? 'Generate comic with AI images'
                          : 'Generate fixed comic'}
              </button>
              <div className="privacy-note">
                <span>✦</span>
                <p>
                  {sampleMode ? (
                    'Illustrative source files for previewing the interface. This sample is not a live GitHub scan.'
                  ) : (
                    <>
                      Scans repository tree, then reads up to 40 representative
                      files at commit {repository.commitSha.slice(0, 7)}.
                      Secrets, binaries, dependencies, and generated files stay
                      excluded.
                    </>
                  )}
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
                    !hasByokArtwork(explanation.analysis?.artworkProvider)
                      ? `Generating ${activePanelCount} AI panels…`
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
                {hasByokArtwork(explanation.analysis.artworkProvider)
                  ? 'API-free story · user-funded AI artwork.'
                  : sampleMode
                    ? 'Illustrative sample.'
                    : 'API-free template mode.'}
              </strong>{' '}
              {sampleMode
                ? 'Bundled example panels and evidence. No repository was fetched or verified.'
                : 'Story explains selected source code without an OpenAI API call.'}
              {hasByokArtwork(explanation.analysis.artworkProvider)
                ? ' Images use your selected provider key.'
                : ' Images use bundled templates.'}{' '}
              {!sampleMode
                ? 'Add your key in API key / BYOK to generate unique images.'
                : ''}
            </p>
          ) : null}
          <ManualArtwork
            key={`${explanation.id}:${explanation.analysis.panels.length}`}
            analysis={explanation.analysis}
          />
          {explanation.artifactUrl ? (
            <img
              src={explanation.artifactUrl}
              alt={`Generated ${explanation.analysis.panels.length}-panel repository comic`}
              referrerPolicy="no-referrer"
            />
          ) : null}
          {explanation.analysis.panels.map((panel) => (
            <article className="side-story" key={panel.sequence}>
              <header>
                <span>{String(panel.sequence).padStart(2, '0')}</span>
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
            {!sampleMode ? (
              <button
                className="secondary-action"
                type="button"
                onClick={createShare}
                disabled={localMode || busy || artworkBusy}
              >
                {localMode ? 'Sharing requires hosted mode' : 'Copy share link'}
              </button>
            ) : null}
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
        {sampleMode ? (
          <span>Sample preview · Comic Code</span>
        ) : (
          <button
            type="button"
            onClick={() =>
              void chrome.tabs.create({ url: 'chrome://settings/appearance' })
            }
          >
            Panel: {panelSide === 'unknown' ? 'browser setting' : panelSide} ·
            move in Chrome Appearance
          </button>
        )}
        {session && !localMode ? (
          <button type="button" onClick={logout} disabled={busy || artworkBusy}>
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
