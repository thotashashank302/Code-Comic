'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  hasByokArtwork,
  imageProviders,
  type ImageProvider,
} from '@comic-code/contracts/image-providers'

import type { ComicAnalysis } from '@comic-code/contracts'
import {
  getSampleExplanation,
  getSampleRepository,
} from '@comic-code/comic/sample'
import type { PanelCount } from '@comic-code/contracts/comic-layout'
import { ManualArtwork } from '@comic-code/ui'

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
    local_comic_corrupt:
      'This saved comic file is damaged. Other comics are still available. Inspect its repository to generate a replacement.',
    artwork_conflict:
      'This comic changed in another tab. Reload it before replacing its artwork again.',
    explanation_not_found:
      'This comic expired, was deleted, or is not available to your account.',
    github_unavailable:
      'Comic Code could not reach GitHub after retrying. Try Inspect again when the connection recovers. Saved comics and samples still work.',
    local_storage_unavailable:
      'Comic Code cannot write to its data directory. Check free disk space and permissions, or set COMIC_CODE_DATA_DIR to a writable folder and restart.',
    local_request_failed:
      'Comic Code could not complete this local operation. Retry, or check the server log if it keeps failing.',

    authentication_required: 'Connect GitHub to continue.',
    invalid_repository_url: 'Paste a full GitHub repository URL.',
    repository_changed:
      'The repository branch moved. Inspect it again before generating.',
    daily_quota_reached:
      'Daily safety limit is 25 comics. Try again after 24 hours.',
    no_executable_code:
      'This repository has no safe, readable source files to explain.',
    extension_not_allowed:
      'This extension is not approved by the hosted server. Configure ALLOWED_EXTENSION_IDS with its Chrome extension ID.',
    github_reconnect_required:
      'Your GitHub login expired. Reconnect GitHub, then try again.',
    github_access_denied:
      'GitHub denied access to this repository. Check your account and GitHub App permissions.',
    repository_not_found:
      'GitHub could not find this repository or your account cannot access it.',
    github_app_installation_required:
      'Install the read-only Comic Code GitHub App on this private repository, then try again.',
    invalid_image_provider_credentials:
      'Choose an image provider, model and valid API key.',
    image_provider_auth_failed:
      'The image provider rejected this key. Check the selected provider and key permissions.',
    image_provider_quota_reached:
      'Your image provider quota or rate limit was reached. Check billing and available credits.',
    image_provider_unavailable:
      'The image provider is unavailable. Your existing comic is unchanged.',
    image_provider_model_unavailable:
      'This image model is unavailable to your key. Choose another model or check account access.',
    image_provider_rejected:
      'The image request was rejected. Check your key and model access, or try a different image model.',
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
  const [panelCount, setPanelCount] = useState<PanelCount>(12)
  const [recent, setRecent] = useState<Explanation[]>([])
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [repository, setRepository] = useState<Repository | null>(null)
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const [imageProvider, setImageProvider] = useState<ImageProvider>('openai')
  const [imageModel, setImageModel] = useState<string>(
    imageProviders.openai.models[0],
  )
  const [imageApiKey, setImageApiKey] = useState('')
  const [artworkBusy, setArtworkBusy] = useState(false)
  const [artworkNotice, setArtworkNotice] = useState<string | null>(null)
  const [aiGenerationRequested, setAiGenerationRequested] = useState(false)
  const imageSettings = useRef<HTMLDetailsElement>(null)
  const pendingImage = useRef(false)
  const imageReady =
    imageApiKey.trim().length >= 20 &&
    imageApiKey.trim().length <= 2_048 &&
    !/\s/.test(imageApiKey.trim())

  const activePanelCount = explanation?.analysis?.panels.length ?? panelCount

  useEffect(() => {
    const controller = new AbortController()
    api<{ user: User | null; mode?: string }>('/api/v1/auth/me', {
      signal: controller.signal,
    })
      .then(async (result) => {
        setUser(result.user)
        setLocalMode(result.mode === 'local')
        if (result.mode === 'local') {
          try {
            const saved = await api<{ explanations: Explanation[] }>(
              '/api/v1/explanations',
              { signal: controller.signal },
            )
            if (!controller.signal.aborted) setRecent(saved.explanations)
          } catch (caught) {
            if (!controller.signal.aborted)
              setError(
                friendlyError(
                  caught instanceof Error
                    ? caught.message
                    : 'local_request_failed',
                ),
              )
          }
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setUser(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuthChecked(true)
      })
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

  useEffect(() => {
    if (
      localMode ||
      sampleMode ||
      !activeExplanationId ||
      activeStatus !== 'completed' ||
      !explanation?.artifactUrl
    )
      return
    let active = true
    const refresh = async () => {
      try {
        const result = await api<{ explanation: Explanation }>(
          `/api/v1/explanations/${activeExplanationId}`,
        )
        if (active) setExplanation(result.explanation)
      } catch {
        /* Preserve the current story during a temporary connection failure. */
      }
    }
    const interval = window.setInterval(refresh, 4 * 60 * 1000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [
    activeExplanationId,
    activeStatus,
    explanation?.artifactUrl,
    localMode,
    sampleMode,
  ])

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

  const generate = async () => {
    if (sampleMode) {
      setExplanation(getSampleExplanation(panelCount))
      return
    }
    if (!repository) return
    setBusy(true)
    setError(null)
    pendingImage.current = imageReady
    setAiGenerationRequested(imageReady)
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
            panelCount,
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

  const generateWithImageProvider = useCallback(
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
              provider: imageProvider,
              model: imageModel,
              apiKey: imageApiKey.trim(),
            }),
          },
        )
        setExplanation(result.explanation)
        setAiGenerationRequested(false)
        setArtworkNotice(
          `${target.analysis.panels.length} panels generated with your image API key. Captions and evidence are unchanged.`,
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
    [imageProvider, imageModel, imageApiKey, sampleMode],
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

  const clearImageCredentials = () => {
    pendingImage.current = false
    setAiGenerationRequested(false)
    setImageApiKey('')
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
    pendingImage.current = false
    setSampleMode(true)
    setAiGenerationRequested(false)
    setError(null)
    setArtworkNotice(null)
    setShareNotice(null)
    setRepository(getSampleRepository(panelCount))
    setExplanation(getSampleExplanation(panelCount))
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
          <a
            href="#api-key"
            onClick={() => imageSettings.current?.setAttribute('open', '')}
          >
            API key / BYOK
          </a>
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
        <div className="story-length">
          <label htmlFor="story-panel-count">Story length for new comics</label>
          <select
            id="story-panel-count"
            value={panelCount}
            disabled={busy || artworkBusy}
            onChange={(event) => {
              const count = Number(event.target.value) as PanelCount
              setPanelCount(count)
              pendingImage.current = false
              setAiGenerationRequested(false)
              if (sampleMode) {
                setRepository(getSampleRepository(count))
                setExplanation(getSampleExplanation(count))
              }
            }}
          >
            <option value="12">12 panels · detailed walkthrough</option>
            <option value="4">4 panels · quick overview</option>
          </select>
          <small>
            More panels add context. Existing saved comics keep their original
            length.
          </small>
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
            keep one. Optional AI images use your own provider key and quota.
          </p>
        ) : null}
        <details
          id="api-key"
          ref={imageSettings}
          className="byok-card"
          aria-labelledby="image-setup-title"
        >
          <summary>
            <span>
              <strong>API key / BYOK</strong>
              <small>OpenAI or Google Gemini · free comics need no key</small>
            </span>
            <span aria-hidden="true">+</span>
          </summary>
          <div>
            <h3 id="image-setup-title">Bring your own image AI</h3>
            <p>
              Choose a provider and image model, then enter your API key. Your
              account generates {activePanelCount} illustrations for the saved
              storyboard. Captions and evidence stay unchanged. Leave the key
              empty for free bundled artwork.
            </p>
          </div>
          {sampleMode ? (
            <p className="byok-privacy" role="status">
              Preview the provider choices here. Key entry and AI generation are
              disabled in sample mode; inspect a real repository to use them.
            </p>
          ) : null}
          <div className="byok-fields">
            <label htmlFor="image-provider">
              Image provider
              <select
                id="image-provider"
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
            <label htmlFor="image-model">
              Image model
              <select
                id="image-model"
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
            <label htmlFor="image-api-key">
              {imageProviders[imageProvider].label} API key
              <input
                id="image-api-key"
                type="password"
                value={imageApiKey}
                onChange={(event) => {
                  pendingImage.current = false
                  setAiGenerationRequested(false)
                  setImageApiKey(event.target.value)
                }}
                placeholder="Paste your provider API key"
                disabled={sampleMode || busy || artworkBusy}
                maxLength={2048}
                autoComplete="new-password"
                spellCheck={false}
              />
            </label>
          </div>
          <p className="byok-privacy">
            The key stays in this tab and passes through Comic Code only for
            requested image generation. It is never saved on the server. Only
            illustration prompts are sent to the selected provider.{' '}
            {activePanelCount} images use your provider’s quota and billing.{' '}
            <a
              href={imageProviders[imageProvider].keyUrl}
              target="_blank"
              rel="noreferrer"
            >
              Get a key from {imageProviders[imageProvider].label}
            </a>
          </p>
          <div className="byok-actions">
            {!sampleMode &&
            ['completed', 'failed'].includes(explanation?.status ?? '') &&
            explanation?.analysis ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => void generateWithImageProvider(explanation)}
                disabled={!imageReady || artworkBusy || busy}
              >
                {artworkBusy
                  ? `Generating ${activePanelCount} AI panels…`
                  : `Generate ${activePanelCount} AI panels`}
              </button>
            ) : (
              <span className="success-text" role="status">
                {sampleMode
                  ? 'Sample mode never uses or saves keys.'
                  : imageReady
                    ? 'Key entered. Generate a comic to use your selected image AI.'
                    : 'No key: free bundled artwork remains available.'}
              </span>
            )}
            <button
              className="text-button"
              type="button"
              onClick={clearImageCredentials}
              disabled={artworkBusy || busy}
            >
              Clear API key
            </button>
          </div>
          {artworkNotice ? (
            <p className="success-text" role="status">
              {artworkNotice}
            </p>
          ) : null}
        </details>
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
                setRepository(null)
                setExplanation(null)
                pendingImage.current = false
                setAiGenerationRequested(false)
                setArtworkNotice(null)
                setShareNotice(null)
                setBusy(true)
                try {
                  const result = await api<{ explanation: Explanation }>(
                    `/api/v1/explanations/${id}`,
                  )
                  setExplanation(result.explanation)
                  setRepositoryUrl(
                    `https://github.com/${result.explanation.repository}/tree/${result.explanation.ref.split('/').map(encodeURIComponent).join('/')}`,
                  )
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
            <small>
              To regenerate a saved comic, inspect its repository again using
              the URL above.
            </small>
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
                      ? imageReady && !sampleMode
                        ? 'Regenerate comic with AI images'
                        : 'Regenerate fixed comic'
                      : explanation?.status === 'failed'
                        ? 'Retry generation'
                        : imageReady && !sampleMode
                          ? 'Generate comic with AI images'
                          : 'Generate fixed comic'}
              </button>
            </footer>
          </div>
        ) : null}

        {explanation ? (
          <div className="generation-card" aria-live="polite">
            <div className="progress-heading">
              <div>
                <span className="eyebrow">{explanation.status}</span>
                <h3>
                  {aiGenerationRequested &&
                  !hasByokArtwork(explanation.analysis?.artworkProvider)
                    ? `Generating ${activePanelCount} AI comic panels…`
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
              hasByokArtwork(explanation.analysis.artworkProvider)) ? (
              <>
                <ManualArtwork
                  key={`${explanation.id}:${explanation.analysis.panels.length}`}
                  analysis={explanation.analysis}
                />
                <Storyboard
                  sample={sampleMode}
                  analysis={explanation.analysis}
                  artifactUrl={explanation.artifactUrl}
                />
              </>
            ) : null}
            {explanation.analysis &&
            explanation.status !== 'failed' &&
            (!aiGenerationRequested ||
              hasByokArtwork(explanation.analysis.artworkProvider)) ? (
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
