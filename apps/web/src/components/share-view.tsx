'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import type { ComicAnalysis } from '@comic-code/contracts'

import { BrandMark } from '@/components/brand-mark'
import { Storyboard } from '@/components/storyboard'

type SharedExplanation = {
  repository: string
  ref: string
  analysis: ComicAnalysis | null
  artifactUrl: string | null
  expiresAt: string
}

type ShareViewProps = { shareId: string }

export function ShareView({ shareId }: ShareViewProps) {
  const [explanation, setExplanation] = useState<SharedExplanation | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>(
    'loading',
  )

  const capability = useRef<{ id: string; token: string | null } | null>(null)

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    if (capability.current?.id !== shareId)
      capability.current = { id: shareId, token: fragment.get('token') }
    const token = capability.current.token
    window.history.replaceState(null, '', window.location.pathname)
    if (!token) {
      const invalidTimer = window.setTimeout(() => setStatus('invalid'), 0)
      return () => window.clearTimeout(invalidTimer)
    }

    const controller = new AbortController()
    const refresh = () => {
      void fetch(`/api/v1/shares/${shareId}/exchange`, {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('invalid')
          return (await response.json()) as { explanation: SharedExplanation }
        })
        .then((result) => {
          if (!controller.signal.aborted) {
            setExplanation(result.explanation)
            setStatus('ready')
          }
        })
        .catch(() => {
          if (controller.signal.aborted) return
          setStatus('invalid')
        })
    }
    void refresh()
    const interval = window.setInterval(refresh, 4 * 60 * 1000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [shareId])

  return (
    <main className="share-shell">
      <header className="share-header">
        <Link className="brand" href="/">
          <BrandMark compact />
          <span>comic code</span>
        </Link>
        <span className="privacy-pill">Private capability link</span>
      </header>

      {status === 'loading' ? (
        <section className="share-state" aria-live="polite">
          <BrandMark />
          <h1>Unlocking the story…</h1>
          <p>
            The secret is being exchanged and removed from your address bar.
          </p>
        </section>
      ) : null}

      {status === 'invalid' ? (
        <section className="share-state">
          <BrandMark />
          <h1>This link is no longer available.</h1>
          <p>It may be incomplete, expired, revoked, or already deleted.</p>
        </section>
      ) : null}

      {status === 'ready' && explanation?.analysis ? (
        <section className="shared-story">
          <div className="shared-story__intro">
            <span className="eyebrow">Shared visual explanation</span>
            <h1>
              {explanation.repository} · {explanation.ref}
            </h1>
            <p>
              This link expires automatically and never exposes repository
              source.
            </p>
          </div>
          <Storyboard
            analysis={explanation.analysis}
            artifactUrl={explanation.artifactUrl}
          />
        </section>
      ) : null}
    </main>
  )
}
