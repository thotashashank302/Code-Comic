'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { ComicAnalysis } from '@comic-code/contracts'
import {
  composeUploadedArtwork,
  panelPrompts,
  sampleArtworkFiles,
  validateArtworkFile,
} from './artwork'

type Slot = { file: File; url: string } | null

export function ManualArtwork({ analysis }: { analysis: ComicAnalysis }) {
  const count = analysis.panels.length
  const inputId = useId()
  const [slots, setSlots] = useState<Slot[]>(() => Array(count).fill(null))
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const active = useRef(true)
  const current = useRef<Slot[]>(slots)
  const currentResult = useRef<string | null>(null)
  const prompts = panelPrompts(analysis)
  const ready = slots.filter(Boolean).length

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      current.current.forEach((slot) => {
        if (slot) URL.revokeObjectURL(slot.url)
      })
      if (currentResult.current) URL.revokeObjectURL(currentResult.current)
    }
  }, [])

  function updateFiles(files: (File | null)[]) {
    files.forEach((file) => {
      if (file) validateArtworkFile(file)
    })
    const next = files.map((file) =>
      file ? { file, url: URL.createObjectURL(file) } : null,
    )
    current.current.forEach((slot) => {
      if (slot) URL.revokeObjectURL(slot.url)
    })
    current.current = next
    setSlots(next)
    if (currentResult.current) URL.revokeObjectURL(currentResult.current)
    currentResult.current = null
    setResult(null)
    setError(null)
    setNotice(null)
  }

  async function copy(text: string) {
    setError(null)
    setNotice(null)
    try {
      await navigator.clipboard.writeText(text)
      setNotice(
        'Prompts copied. Use one prompt at a time to generate each panel, then return here.',
      )
    } catch {
      setError(
        'Clipboard access is unavailable. Select and copy the prompt text below.',
      )
    }
  }

  async function loadSamples() {
    setBusy(true)
    setError(null)
    try {
      const files = await sampleArtworkFiles(count)
      if (active.current) {
        updateFiles(files)
        setNotice(
          'Sample artwork loaded for testing. These are local test images, not AI-generated images.',
        )
      }
    } catch {
      if (active.current)
        setError(
          'Could not prepare sample artwork. Try choosing your own files.',
        )
    } finally {
      if (active.current) setBusy(false)
    }
  }

  async function compose() {
    setBusy(true)
    setError(null)
    try {
      const blob = await composeUploadedArtwork(
        analysis,
        current.current.map((slot) => slot!.file),
      )
      if (!active.current) return
      if (currentResult.current) URL.revokeObjectURL(currentResult.current)
      const url = URL.createObjectURL(blob)
      currentResult.current = url
      setResult(url)
      setNotice(
        `${count}-panel preview ready. Download it to keep it; uploaded artwork is not saved on the server.`,
      )
    } catch (failure) {
      if (active.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not compose the artwork. Check your image files.',
        )
    } finally {
      if (active.current) setBusy(false)
    }
  }

  return (
    <details className="artwork-studio">
      <summary>Use your own images · no API key</summary>
      <div className="artwork-studio__body">
        <h3>Make a {count}-panel comic with your own artwork</h3>
        <p>
          Choose your story length first. Use one prompt at a time in Gemini or
          another image tool to generate each image, then choose the files here.
          This tests prompts, image order and PNG composition. No image API is
          called.
        </p>
        <div className="artwork-studio__actions">
          <button
            type="button"
            onClick={() =>
              void copy(
                prompts
                  .map((panel) => panel.prompt)
                  .join('\n\n--- NEXT PANEL ---\n\n'),
              )
            }
          >
            Copy all panel prompts
          </button>
          <a href="https://gemini.google.com/" target="_blank" rel="noreferrer">
            Open Gemini
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={() => void loadSamples()}
          >
            Load sample artwork
          </button>
        </div>
        <label className="artwork-studio__bulk" htmlFor={`${inputId}-all`}>
          Choose multiple images
          <input
            id={`${inputId}-all`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={busy}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []).sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true }),
              )
              if (!files.length) return
              try {
                if (files.length > count)
                  throw new Error(`Choose at most ${count} images.`)
                updateFiles(
                  Array.from(
                    { length: count },
                    (_, index) => files[index] ?? null,
                  ),
                )
                setNotice(
                  'Files assigned in filename order. Check each panel below before composing.',
                )
              } catch (failure) {
                setError((failure as Error).message)
              }
              event.target.value = ''
            }}
          />
          <small>
            PNG, JPEG or WebP · up to 8 MB each. Name files panel-01, panel-02,
            etc. to preserve order.
          </small>
        </label>
        <p className="artwork-studio__privacy">
          Files stay in this browser. They are not uploaded, persisted or sent
          to AI providers. Captions and evidence are kept as written. Sample
          artwork is for testing and is not AI-generated.
        </p>
        {error ? (
          <p className="artwork-studio__error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
        <ol className="artwork-studio__panels">
          {prompts.map((panel, index) => (
            <li key={panel.sequence}>
              <h4>
                {panel.sequence}. {panel.title}
              </h4>
              <details>
                <summary>Panel {panel.sequence} prompt</summary>
                <textarea
                  aria-label={`Panel ${panel.sequence} image prompt`}
                  readOnly
                  value={panel.prompt}
                  rows={8}
                />
                <button type="button" onClick={() => void copy(panel.prompt)}>
                  Copy panel {panel.sequence} prompt
                </button>
              </details>
              <label htmlFor={`${inputId}-${panel.sequence}`}>
                Artwork for panel {panel.sequence}
                <input
                  id={`${inputId}-${panel.sequence}`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    try {
                      updateFiles(
                        current.current.map((slot, offset) =>
                          offset === index ? file : (slot?.file ?? null),
                        ),
                      )
                    } catch (failure) {
                      setError((failure as Error).message)
                    }
                    event.target.value = ''
                  }}
                />
              </label>
              {slots[index] ? (
                <figure>
                  <img
                    src={slots[index]!.url}
                    alt={`Chosen artwork for panel ${panel.sequence}`}
                  />
                  <figcaption>{slots[index]!.file.name}</figcaption>
                </figure>
              ) : (
                <p className="artwork-studio__empty">No artwork chosen yet.</p>
              )}
            </li>
          ))}
        </ol>
        <div className="artwork-studio__actions">
          <button
            className="artwork-studio__primary"
            type="button"
            disabled={busy || ready !== count}
            onClick={() => void compose()}
          >
            {busy ? 'Preparing artwork…' : `Compose ${count}-panel PNG`}
          </button>
          <span role="status">
            {ready} of {count} images ready
          </span>
          <button
            type="button"
            disabled={busy || !ready}
            onClick={() => {
              updateFiles(Array(count).fill(null))
              setNotice('Artwork cleared from this browser.')
            }}
          >
            Clear artwork
          </button>
        </div>
        {result ? (
          <div className="artwork-studio__result">
            <h4>Your artwork preview</h4>
            <img
              src={result}
              alt={`Composed ${count}-panel comic with user-supplied artwork`}
            />
            <a href={result} download={`comic-code-${count}-panels.png`}>
              Download {count}-panel artwork PNG
            </a>
          </div>
        ) : null}
      </div>
    </details>
  )
}
