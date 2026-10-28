'use client'

import type { ReactNode } from 'react'

export function MosaicIcon({
  name,
  className = '',
}: {
  name:
    | 'spark'
    | 'repo'
    | 'code'
    | 'link'
    | 'image'
    | 'arrow'
    | 'check'
    | 'search'
  className?: string
}) {
  const paths: Record<string, ReactNode> = {
    spark: (
      <>
        <path
          d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"
          fill="currentColor"
          stroke="none"
        />
        <path
          d="m19 1 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
    repo: (
      <>
        <path d="M6 3h14v18H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" />
        <path d="M3 17a3 3 0 0 1 3-3h14M8 6h7M8 9h5" />
      </>
    ),
    code: (
      <>
        <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16" />
      </>
    ),
    link: (
      <>
        <path d="m9 15 6-6m-6 0 3-3a4 4 0 0 1 6 6l-3 3m0 0-3 3a4 4 0 0 1-6-6l3-3" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8" cy="8" r="1.5" />
        <path d="m4 17 5-5 4 4 3-3 5 5" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
  }
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function WindowBar({ title }: { title: string }) {
  return (
    <div className="window-bar">
      <i />
      <i />
      <i />
      <span>{title}</span>
    </div>
  )
}

export function ProductMosaic({
  value,
  onChange,
  onInspect,
  onSample,
  busy,
  ready,
  signedIn,
}: {
  value: string
  onChange: (value: string) => void
  onInspect: () => void
  onSample: () => void
  busy: boolean
  ready: boolean
  signedIn: boolean
}) {
  return (
    <section
      className="product-mosaic"
      aria-label="Comic Code product overview"
    >
      <article
        className="mosaic-card mosaic-notification"
        aria-label="Sample output notification"
      >
        <div className="sample-toast">
          <span className="toast-icon">
            <MosaicIcon name="spark" />
          </span>
          <div>
            <strong>A little clarity, delivered.</strong>
            <p>Your repository. Four comic panels.</p>
          </div>
          <span className="toast-label">SAMPLE</span>
        </div>
      </article>
      <article className="mosaic-card mosaic-tools">
        <h2>
          Your code.
          <br />A clearer picture.
        </h2>
        <p>
          From source files to
          <br />
          “oh, I get it.”
        </p>
        <div className="source-peek" aria-hidden="true">
          <div>
            <span />
            <span />
            <span />
          </div>
          <code>reading-list/</code>
          <code>↳ book-form.tsx</code>
          <code>↳ validate-book.ts</code>
          <code>↳ library.ts</code>
        </div>
        <div className="tool-chips">
          <span>
            <MosaicIcon name="repo" />
            GitHub repositories
          </span>
          <span>
            <MosaicIcon name="link" />
            Linked evidence
          </span>
          <span>
            <MosaicIcon name="image" />
            PNG export
          </span>
        </div>
      </article>
      <article className="mosaic-card mosaic-main">
        <div className="mosaic-main-copy">
          <h1>
            <span>Understand</span> your code.
            <br />
            One story at a time.
          </h1>
          <p>
            A GitHub repository, translated into
            <br className="desktop-break" /> four evidence-linked comic panels.
          </p>
          <button
            className="sample-link"
            type="button"
            disabled={busy}
            onClick={onSample}
          >
            Explore a sample <MosaicIcon name="arrow" />
          </button>
        </div>
        <div className="mosaic-windows" aria-hidden="true">
          <div className="source-window">
            <WindowBar title="reading-list / source" />
            <div className="source-window-body">
              <aside>
                <MosaicIcon name="repo" />
                <span />
                <span />
                <span />
              </aside>
              <div>
                <span className="code-line code-line--short" />
                <span className="code-line" />
                <span className="code-line code-line--medium" />
                <span className="code-line" />
                <span className="code-line code-line--short" />
                <span className="code-line code-line--medium" />
              </div>
            </div>
          </div>
          <div className="comic-window">
            <WindowBar title="your code, explained" />
            <div className="mini-panels">
              {['Receive', 'Check', 'Save', 'Show'].map((label, index) => (
                <div key={label}>
                  <span>0{index + 1}</span>
                  <MosaicIcon
                    name={(['repo', 'check', 'code', 'image'] as const)[index]!}
                  />
                  <strong>{label}</strong>
                </div>
              ))}
            </div>
          </div>
          <span className="window-badge">
            <MosaicIcon name="check" />
            One repo. One clear story.
          </span>
          <span className="window-spark">
            <MosaicIcon name="spark" />
            <span>
              <i />
              <i />
            </span>
          </span>
          <svg className="window-cursor" viewBox="0 0 24 28">
            <path
              d="M3 2v22l6-6 5 8 4-2-5-8 8-2Z"
              fill="white"
              stroke="#20251d"
              strokeWidth="1.4"
            />
          </svg>
        </div>
      </article>
      <article className="mosaic-card mosaic-process">
        <span className="soft-tag">
          <MosaicIcon name="link" />
          Every claim has a source
        </span>
        <h2>
          Less guessing.
          <br />
          More context.
        </h2>
        <p>
          Follow the story.
          <br />
          Then follow the evidence.
        </p>
        <div
          className="process-bars"
          aria-label="Four stages: read, map, explain, export"
        >
          {['Read', 'Map', 'Explain', 'Export'].map((step, index) => (
            <div key={step}>
              <span className={`process-bar process-bar--${index}`}>
                <MosaicIcon
                  name={(['repo', 'link', 'spark', 'image'] as const)[index]!}
                />
              </span>
              <small>{step}</small>
            </div>
          ))}
        </div>
        <span className="process-caption">
          Four panels, from beginning to end.
        </span>
      </article>
      <article className="mosaic-card mosaic-search">
        <h2>
          What will you
          <br />
          understand next?
        </h2>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onInspect()
          }}
        >
          <label className="sr-only" htmlFor="repository-url">
            GitHub repository URL
          </label>
          <span className="search-symbol">
            <MosaicIcon name="search" />
          </span>
          <input
            id="repository-url"
            type="url"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Paste a GitHub repository URL"
            autoComplete="url"
            required
            disabled={busy}
          />
          <button
            className="inspect-button"
            type="submit"
            disabled={!ready || busy || !value.trim()}
          >
            {!ready
              ? 'Loading…'
              : busy
                ? 'Working…'
                : signedIn
                  ? 'Inspect'
                  : 'Connect GitHub'}
            <MosaicIcon name="arrow" />
          </button>
        </form>
      </article>
    </section>
  )
}
