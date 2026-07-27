import Image from 'next/image'

import type { ComicAnalysis } from '@comic-code/contracts'

type StoryboardProps = {
  analysis: ComicAnalysis
  artifactUrl: string | null
}

export function Storyboard({ analysis, artifactUrl }: StoryboardProps) {
  const isFallback = analysis.generationMode === 'deterministic_fallback'
  const hasUserArtwork = analysis.artworkProvider === 'cloudflare_byok'

  return (
    <section className="storyboard" aria-labelledby="storyboard-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Grounded explanation</span>
          <h2 id="storyboard-title">The code, explained as a story</h2>
        </div>
        <span className="confidence-pill">
          {analysis.claims.length}{' '}
          {isFallback ? 'evidence-linked claims' : 'verified claims'}
        </span>
      </div>

      {isFallback ? (
        <div className="notice notice--fallback" role="status">
          <strong>
            {hasUserArtwork
              ? 'Local structural preview · user-funded AI artwork'
              : 'Local structural preview'}
          </strong>
          <p>
            This preview scans representative files at one repository commit and
            explains their detected structure without an OpenAI API call.{' '}
            {hasUserArtwork
              ? 'Panel images were generated using your Cloudflare credentials.'
              : 'Artwork uses bundled visual templates.'}{' '}
            It explains detected code behavior and flow, but not unstated
            business intent.
          </p>
        </div>
      ) : null}

      {artifactUrl ? (
        <div className="comic-preview">
          <Image
            src={artifactUrl}
            alt="Four-panel Comic Code explanation"
            width={1600}
            height={1200}
            unoptimized
            referrerPolicy="no-referrer"
            priority
          />
        </div>
      ) : null}

      <div className="panel-grid">
        {analysis.panels.map((panel) => (
          <article className="story-panel" key={panel.sequence}>
            <header>
              <span className="panel-number">0{panel.sequence}</span>
              <span className="panel-purpose">{panel.purpose}</span>
            </header>
            <h3>{panel.title}</h3>
            <p>{panel.caption}</p>
            {panel.uncertaintyNote ? (
              <small>Uncertainty: {panel.uncertaintyNote}</small>
            ) : null}
          </article>
        ))}
      </div>

      <details className="evidence-drawer">
        <summary>View evidence map</summary>
        <div className="evidence-list">
          {analysis.evidence.map((evidence) => (
            <div className="evidence-row" key={evidence.id}>
              <code>{evidence.id}</code>
              <span>
                {evidence.filePath ?? evidence.source}
                {evidence.newStart
                  ? ` · lines ${evidence.newStart}–${evidence.newEnd}`
                  : ''}
              </span>
            </div>
          ))}
        </div>
      </details>
    </section>
  )
}
