# Local recheck — 28 October 2026

## Findings and fixes

BYOK was hard to find: the web required a repository scan before showing a
collapsed, vaguely named settings section. The extension placed it only inside
the live Explain tab and omitted it entirely from the sample preview.

The web now has an **API key / BYOK** navigation shortcut which expands the
settings. Its fields exist before inspection. The extension settings sit below
the header on every tab, including the empty state. Both sample interfaces show
the actual field placement with inputs disabled and explain how to use live
generation. Tokens are masked. Web entry, ready-state copy, and clearing were
checked interactively with disposable dummy values and no provider request.
The README now explains setup and the different web/extension storage behavior.

New API regressions exposed a separate defect: the analysis wrapper converted
Cloudflare authentication and quota failures into generic analysis failures.
Preserving the original provider error now produces the intended 401/429 API
response and lets both clients show the relevant recovery message. These two
regressions failed before the fix and pass after it. A third test covers provider
unavailability. All three check the outgoing bearer token, the absence of that
token in request bodies, disk records and logs, and preservation/download of the
previous completed comic.

## Verification

| Check                                            | Result                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                     | Pass: 61 tests; lint, formatting, web/extension production builds and six workspace typechecks                                                    |
| Optional standalone live source integration test | Skipped by default; separate production smoke below exercised real GitHub                                                                         |
| `pnpm audit --prod --json`                       | Zero known production vulnerabilities                                                                                                             |
| `pnpm smoke:local`                               | All 10 checks pass: real GitHub inspect/generate at immutable SHA, 1600×1200 PNG, saved listing, deletion and access guards                       |
| `pnpm smoke:preview`                             | All 7 checks pass: BYOK present before scan, bundle/assets/font/PNG and preview CSP                                                               |
| Browser                                          | Web key shortcut, masked dummy entry, clearing, sample field disabling; extension Explain/Story/Evidence, compact layout and BYOK disclosure work |
| Layout                                           | Web at 320px has no document overflow; extension preview checked at 390px; normal-width fields remain visible and aligned                         |
| Organization                                     | Source stays in apps/packages/scripts/docs; generated extension preview, local records, secrets and dependencies remain untracked                 |

The extension preview still emits the previously recorded in-app-browser
MutationObserver error on loading. It has no reported source stack, has not
been mapped to the shipped bundle, and did not block the tested controls. The
web page had no captured console errors in this check. This remains a browser
preview diagnostic to resolve in actual Chrome acceptance testing.

Live Cloudflare generation has not been claimed as passing: it requires a real
user token, model access and available account quota. No real credentials were
read or used in this recheck. Installation/permissions in Chrome, hosted OAuth,
Supabase, worker deployment, sharing and hosted production acceptance remain
separate from the verified local runtime and browser preview. A Cloudflare token
does not remove GitHub's independent request limit.
