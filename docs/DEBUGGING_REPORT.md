# Debugging and readiness report

Date: 28 October 2026.

## Outcome

A working free **local** product is available for public GitHub repositories:
inspect → analyze at the inspected commit → compose four panels → save → reopen
→ download PNG → delete. It needs internet and GitHub's public allowance, but no
paid API, OAuth application, Supabase, Trigger.dev or hosting account. Optional
Cloudflare generation and the hosted multi-user runtime remain separate.

The local branch is `fix/free-local-runtime`, based on the existing draft PR
branch at `1777c2e`. GitHub `main` was still at `748172e` when inspected. Earlier
repository-generation, immutable-commit, dispatch-recovery and migration fixes
were already in PR #1; this work preserves them. No branch was pushed, PR merged,
remote service configured or deployment published in this run.

## Plan and feasibility decisions

1. Inspect main, the existing draft PR, setup requirements and failure paths.
2. Reproduce the baseline with the locked dependency set and existing tests.
3. Remove required service accounts from the free local workflow while retaining
   the optional hosted architecture for private repositories and online shares.
4. Fix GitHub failures, UI recovery and current vulnerable dependencies.
5. Organize documentation, remove proven duplicates and package usable artifacts.
6. Run automated tests, production builds, real GitHub/API/browser checks and a
   current production dependency audit; report external-service limits honestly.

The hosted-only plan was not suitable for a zero-setup free product: it required
OAuth, an active database and a deployed worker even for bundled artwork. The
revised plan uses a loopback-only desktop runtime with atomic disk persistence.
Unlimited free hosted AI is not feasible to promise; provider quotas and service
terms remain outside this repository's control.

## Issues found and changes

| Finding and how it was found                                                                                            | Fix and reason                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main was behind the draft fixes; live branch/PR inspection showed repository generation fixes still unmerged.           | Build on the PR branch locally so those fixes are retained without merging an unverified hosted release.                                                                                              |
| Reading environment parsing and route dispatch showed every generation required the complete hosted stack.              | Add local API routing, public-only GitHub access and in-request template rendering. The app starts with no env file.                                                                                  |
| There was no local persistence or recovery.                                                                             | Store sanitized completed records and PNG bytes atomically in an ignored directory. Add Saved comics; verify recovery after restart.                                                                  |
| Source-fetch errors were swallowed; rate limits could become misleading “no readable source” errors.                    | Preserve actionable non-404 errors and show a GitHub limit message.                                                                                                                                   |
| Every public source file consumed a REST request. A later live smoke run exhausted the anonymous quota.                 | Anonymous public source now uses immutable raw GitHub URLs with timeout and a streamed 750 KB limit. Authenticated/private access retains the Contents API. A real raw-file integration check passed. |
| Truncated GitHub trees were treated as complete.                                                                        | Fail explicitly on truncated API trees rather than imply a full repository was inspected.                                                                                                             |
| The web and extension could hide a valid free comic behind a stale AI loading state after failure.                      | Clear the AI-request state in `finally`; preserve existing output until a replacement is complete.                                                                                                    |
| Delete errors escaped the web UI's error handling.                                                                      | Handle deletion failures, show recovery text and disable conflicting operations.                                                                                                                      |
| The extension always required OAuth.                                                                                    | Detect local runtime, open public repositories without OAuth, resolve download URLs against the API origin and disable online sharing locally.                                                        |
| Initial generation failed because Next normalized loopback names during rewrites. Browser/API testing reproduced a 403. | Validate loopback origin, protocol and port explicitly; accept localhost/127.0.0.1 equivalence. Add a regression test.                                                                                |
| Audit reported 14 production advisories, including three critical.                                                      | Upgrade Next/ESLint config to 16.4.3, Sharp to 0.35.5 and its Linux binaries, Zod to 4.6.7, Trigger.dev to 4.8.1, and source-map-js via a compatible override. Final audit reports zero.              |
| Turbopack production compilation failed while binding its CSS subprocess socket in this environment.                    | Use Next's supported webpack production build; it passes. Development still uses Turbopack.                                                                                                           |
| Root development/build commands were awkward for a free local setup.                                                    | Default `pnpm dev` to a loopback web server; add local extension build/ZIP wrappers, `pnpm check` and a live smoke script. Pin Node 24 as the supported runtime.                                      |
| `page 2.tsx` was an unused placeholder; historical hackathon material cluttered current setup.                          | Remove the duplicate and move historical plans/checklists into `docs/archive`. Rewrite README around current startup and retain hosted setup separately.                                              |

## Validation and evidence

- The initial 44 tests passed before implementation.
- Final regular suite: **57 tests passed**, covering existing behavior plus local
  persistence, real PNG composition, permissions, idempotency, deletion,
  malformed IDs, private-source rejection, failed upgrade preservation,
  concurrency, origin checks, GitHub failure propagation and bounded raw reads.
- One additional real raw-source integration test passed. It is opt-in with
  `COMIC_CODE_LIVE_GITHUB=1` and skipped during ordinary offline-capable tests.
- `pnpm check` passes: tests, lint with zero warnings, formatting, production web
  and extension builds, and typechecks across all six workspaces.
- Production dependency audit: zero reported advisories. This does not prove the
  absence of vulnerabilities.
- Real public inspection/generation succeeded against
  `thotashashank302/Code-Comic` at `748172e0d56027af488765616b85682568c5728e`.
- Production browser checks: completed four-panel result, evidence map, reopening
  the stored comic after restarting the server, and successful PNG download.
- Desktop and 390-pixel mobile screenshots were saved; mobile document width
  equaled viewport width and no images were broken. Browser warnings/errors:
  none observed in the final check.
- Production HTTP checks using a disposable persisted fixture also passed:
  reopen after restart, PNG download, deletion removing both record and PNG,
  and a Chrome extension Origin reaching the local API.
- Chrome MV3 ZIP built successfully for `http://127.0.0.1:3000`.
- An actual forged public Host header returned 403; a foreign Origin with a
  forged bearer string also returned 403. The Host check uses raw HTTP because
  Node fetch silently ignores that header override.
- The broader live smoke run reached GitHub's anonymous limit on a subsequent
  generation. That run is not reported as passing. Existing saved comics remain
  available; its unit/integration equivalents pass and raw-source quota use has
  since been reduced. Re-run `pnpm smoke:local` after quota reset or with an
  optional server-side GitHub token.

## Remaining limits

Local mode is for one user and one process per data directory. It accepts public
repositories only; online sharing requires hosted mode. It trusts processes and
installed extensions on the same computer. Expiry is lazy on read/list, not a
background daemon. Local quotas count retained records; deletion is not a
billing/security boundary. GitHub and raw content can still impose rate limits.
The comic is a bounded structural explanation, not proof of correctness.

Hosted Supabase/RLS/Storage, private GitHub OAuth, deployed Trigger workers,
remote sharing and live Cloudflare credentials were not available for acceptance
testing in this run. The extension was built and checked, but not installed and
exercised in a real Chrome profile. Those flows are not claimed production-ready.
