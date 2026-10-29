# Manual artwork and twelve-panel verification

Checked locally on 29 October 2026.

## Changes and reasons

- Four fixed panels hid useful context. New stories default to twelve separate
  evidence-linked chapters; four-panel quick mode and saved comics remain supported.
- Image API credits prevented routine testing. A shared browser-only studio now
  exports contextual prompts and accepts manually generated artwork. Local sample
  files exercise composition without GitHub or image-provider requests.
- Hard-coded dimensions, panel sequences, reuse keys and storage bounds assumed
  four panels. Contracts, native/browser composition, local persistence and hosted
  recovery now support exactly four or twelve, with ordered sequence validation.
- Twelve simultaneous paid requests could burst provider limits. Generation now
  uses at most three concurrent requests, preserves order and aborts on failure.
- The hosted 10 MB artifact bucket could reject larger PNGs. A CLI-created migration
  raises the private PNG bucket to 32 MiB. It has not been applied to a hosted project.

## Passed checks

- `pnpm check`: 90 tests, lint, formatting, production web/extension builds and
  typechecks across seven packages. The optional live GitHub test stays skipped.
- A fresh forced test run after the dependency-download attempt passes the same
  90 tests. No real provider key or image API call was used.
- `pnpm smoke:preview`: nine checks covering the real extension bundle, fonts,
  same-origin framing, blocked API connections, permitted local blob images,
  and 1600 × 1200 / 1600 × 3540 sample PNGs.
- Browser: twelve local sample images compose successfully in web and extension
  sample mode. Twelve actual PNG/JPEG files selected in reverse order are assigned
  by numeric filenames; the downloaded PNG retains every panel's expected color
  and position, including the final row. Four-panel export remains 1600 × 1200.
- Browser prompt copying succeeds. Web at 320 px and the extension side panel at
  390 px have no horizontal document overflow. Screenshots are supplied with the
  task outputs. Manual artwork remains in browser memory and must be downloaded.

## Remaining boundaries

Live OpenAI/Gemini model acceptance, installed Chrome permissions and hosted
runtime/storage acceptance were not tested. The existing in-app iframe preview
MutationObserver diagnostic does not block composition; it is not proof of an
installed-Chrome run. Structural pattern matching is not semantic analysis or
runtime verification.

The production dependency audit reports three advisories in the existing
`systeminformation@5.31.17` dependency through Trigger.dev: one low, one moderate
and one high (`GHSA-4vjg-vx72-qq4g`, `GHSA-7648-jmwf-vw7j`,
`GHSA-3f7j-7jwc-fxfj`). The audit identifies 5.33.16 as meeting all patched ranges.
Fetching that patch failed because the npm registry connection became unavailable.
The uninstalled override was removed, preserving a consistent lockfile. These
findings remain unresolved; this update does not claim a clean security audit.

GitHub CLI access and the connected GitHub service also failed at the network
transport during finalization. The task records the actual commit/push result
separately; local checks do not prove publication or hosted deployment.
