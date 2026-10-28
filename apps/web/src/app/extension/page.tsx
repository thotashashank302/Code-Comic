import Link from 'next/link'
import { BrandMark } from '@/components/brand-mark'

export default function ExtensionPreviewPage() {
  return (
    <main className="extension-preview-page">
      <nav className="topbar" aria-label="Preview navigation">
        <Link className="brand" href="/">
          <BrandMark compact />
          <span>comic code.</span>
        </Link>
        <Link className="secondary-button" href="/">
          Back to workspace
        </Link>
      </nav>
      <section className="extension-preview-layout">
        <div className="extension-preview-copy">
          <h1>
            A small panel.
            <br />
            <span>A clearer picture.</span>
          </h1>
          <p>
            Explore the Chrome side panel in your browser. Switch between the
            story, its source files, and the evidence behind every panel.
          </p>
          <div className="preview-disclosure">
            <strong>Sample mode. Zero API calls.</strong>
            <p>
              This is the built extension with illustrative data. It doesn’t
              contact GitHub or Cloudflare, store credentials, or require Chrome
              permissions.
            </p>
          </div>
          <ul>
            <li>Try the Explain, Story and Evidence tabs.</li>
            <li>Use “View sample story” to see the comic.</li>
            <li>Download the bundled sample PNG.</li>
          </ul>
        </div>
        <div className="extension-preview-device">
          <div className="device-toolbar">
            <span />
            <span />
            <span />
            <strong>Comic Code · Chrome side panel preview</strong>
          </div>
          <iframe
            src="/extension-preview/sidepanel.html?preview=1"
            title="Interactive Comic Code extension preview with sample data"
          />
        </div>
      </section>
    </main>
  )
}
