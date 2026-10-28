# Pastel mosaic and extension preview

The supplied SaaS mosaic reference replaces the previous dark violet interface.
The web landing uses five unequal panels: pink sample notification, cool-blue
source module, chartreuse source-to-comic hero, peach process module, and a
functional repository URL bar. The workspace, share view and Chrome side panel
use the same light surfaces, dark text and green actions. Plus Jakarta Sans is
bundled locally with its SIL Open Font License; browsers need no Google request.

Existing repository inspection, generation, evidence, download, deletion and
optional Cloudflare controls remain available. **API key / BYOK** is available
from the web navigation before a repository scan and below the extension header
on every tab. Its disclosure shows Cloudflare Account ID and Workers AI API
token fields; sample mode displays them disabled. Template artwork, AI artwork palette instructions, PNG composition and toolbar icons also use the
new palette; old saved comics retain their original artwork.

## Reviewing without provider quota

The web **Explore a sample** / **Try the sample** controls use illustrative data
from `packages/comic/src/sample.ts`, including four panels and four evidence
locators. The sample is never recorded as a live scan or persisted in the comic
store. It can be downloaded from `/sample-comic.png`, generated entirely from
local SVG templates during the web build.

`/extension` embeds the real WXT side-panel bundle at
`/extension-preview/sidepanel.html?preview=1`. It skips Chrome initialization,
repository requests, polling, credential storage and provider calls. Explain,
Story, Evidence and compact layout remain interactive. A restrictive CSP blocks
all connection requests from the browser-served preview. Only this preview is
frameable, and only by the same origin; application pages retain their existing
framing restrictions.

The installed extension's **Explore sample** control also works with the bundled
fixture. Live GitHub/Cloudflare operation, OAuth and actual Chrome integration
remain distinct from UI preview verification.

## Build and checks

`pnpm dev` and `pnpm build` build the extension preview automatically. Generated
files under `apps/web/public/extension-preview` are ignored by Git and source
linters. The build script rewrites copied HTML asset paths to relative paths;
otherwise extension-root paths would produce blank browser frames.

With the local server running, `pnpm smoke:preview` verifies the page, script and
stylesheet paths, local font, 1600×1200 sample PNG, same-origin framing and the
connection-blocking CSP. It calls no providers. Automated regression tests also
validate the sample contract and its evidence references.

The finish review requested stronger small-text contrast, a programmatic active
state on section buttons, and removing redundant heading labels. These were
applied as one batch. The independent finish reviewer returned **Ship**, scoring
all three findings resolved. The detector's two font warnings are intentionally overridden by the
user's explicit Plus Jakarta Sans reference.

## Asset origins

- Typeface: Google Fonts Plus Jakarta Sans, Latin variable WOFF2, weights
  400–800; redistributed with `public/fonts/OFL.txt` in both apps.
- Toolbar PNGs: procedural inline SVG in
  `packages/comic/scripts/generate-extension-icons.mjs`; origin metadata is
  embedded in the source PNGs.
- Comic artwork: procedural SVG in `packages/comic/src/images.ts`, composed by
  `packages/comic/src/compose.ts`; no external image assets or AI generation are
  required for samples or template comics.
- Mosaic geometry and icons: authored inline SVG and CSS in
  `apps/web/src/components/product-mosaic.tsx`.

The automated in-app browser emitted a MutationObserver warning during preview
loading even after the observer-free extension bundle was verified. UI controls
continued to work; the warning was not mapped to the shipped bundle. Actual
Chrome permissions and live-provider flows are outside this visual preview check.
