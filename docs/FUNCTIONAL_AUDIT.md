# Functional audit and regression report

Checked on 30 October 2026. This report supersedes earlier verification snapshots
for the current local runtime. All reproduced code defects below are fixed.
It does not claim that every possible bug or external service has been tested.

## Plan and execution

1. Trace the web, extension, local disk, hosted repository and image paths.
2. Add regression cases for concrete failures before changing their behavior.
3. Implement bounded fixes, rerun focused tests, then run the complete check.
4. Replan on failures: correct the test image stub's lint issue; refresh compatible
   development-tool dependencies and patch the remaining advisories; retest.
5. Verify actual local HTTP flows, browser interactions, artifacts and hosted CI.

## Findings and fixes

| Finding                                                                            | Reproduction/evidence                                                                | Fix                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening a saved comic retained a different repository or sample for regeneration   | DOM test selected a saved comic after a sample                                       | Clear the old repository, pending artwork and notices; prefill the saved repository/ref URL and require a fresh inspection                               |
| A library read failure logged a local user out                                     | Failed saved-list request after successful local authentication                      | Handle library failures separately, preserving the local session and inspection controls                                                                 |
| One corrupt record blocked the complete library and new generation                 | Invalid JSON beside a healthy saved record                                           | Skip corrupt records in listing, preserve their bytes for recovery, and return a specific 422 when opened directly; reject mismatched record IDs         |
| Library listing retained every full base64 PNG in memory                           | Listing returned full records even though clients only need metadata                 | Return summaries without retaining PNG strings; direct record/download reads retain their original data                                                  |
| Replacing local AI artwork could leave the old image displayed                     | A real PNG replacement returned the same artifact URL                                | Persist a new artifact revision on successful replacement; return a stable revision URL for reads, with a backward-compatible value for older records    |
| Extension results/errors appeared under a newly selected repository                | Resolve or reject repository A's pending request after switching to B                | Invalidate pending view operations, ignore stale completions and guard in-flight artifact refreshes; keep each repository's persisted result ID separate |
| Share links failed under React Strict Mode                                         | First effect removed the fragment, cleanup aborted the exchange, replay had no token | Keep the capability only in component memory while removing it from the address bar; ignore canceled responses                                           |
| Hosted image URLs expired while the page stayed open                               | Fake-clock DOM tests advanced beyond the refresh interval                            | Refresh completed authenticated and capability-based image URLs every four minutes; stop refreshes on unmount/view change                                |
| Expired hosted comics remained readable before cron cleanup                        | Real Supabase SDK requests were exercised against a mocked REST boundary             | Filter owner/worker reads by expiry and deletion; return a safe 404; create a fresh generation instead of reusing an expired idempotent result           |
| Concurrent hosted artwork requests could overwrite each other and orphan artifacts | Conditional-save regression rejected an obsolete original path                       | Publish replacement artwork only if the original artifact path still matches; remove a rejected upload and return 409 while preserving the current comic |
| Twelve-panel audit events still recorded four images                               | Twelve-panel hosted image request fixture                                            | Record the actual storyboard panel count                                                                                                                 |
| Invalid requests and origins surfaced as generic server errors                     | Malformed schema and cross-origin HTTP tests                                         | Return 400 for validation failures, 403 for origin rejection, and 404 for missing/expired comics                                                         |
| OAuth return paths could normalize to another host                                 | Backslash/control-character return-path cases                                        | Reject those paths and revalidate the return path at callback                                                                                            |
| Hosted OAuth accepted any syntactically valid Chrome extension recipient           | Start/callback tests used an unapproved extension ID                                 | Require explicit `ALLOWED_EXTENSION_IDS` at both stages; reject credentials/nondefault ports; web sign-in continues without an extension recipient       |

## Cleanup

Repository-wide searches found no application callers for the old semantic
analysis path. Removed `packages/comic/src/analyze.ts`, its obsolete schema test,
`prompts.ts`, the unreachable legacy image helper, unused result type, and the
OpenAI SDK dependency. Active OpenAI/Gemini image-only BYOK remains implemented
through fixed official REST endpoints. Persisted legacy comic formats remain
readable.

Removed the unused Playwright test dependency. Added development-only DOM tests
for actual React lifecycle and repository-switch behavior, and separated the
extension bootstrap from its testable component. Kept migrations, font licenses,
active setup files, user comic records and historical verification reports.

Updated test/build-tool patches and compatible indirect packages, with targeted
security overrides where old parent ranges prevented patched versions. Kept the
Trigger SDK at its existing version. The Trigger CLI loads and its template tar
API successfully creates/extracts a disposable fixture. CI now audits runtime
and development dependencies rather than runtime dependencies alone.

## Verification

- `pnpm check`: **140 tests passed**, lint with zero warnings, formatting,
  production web/extension builds, and all seven workspace typechecks.
- `pnpm audit`: **zero known vulnerabilities**, including development tools.
- `pnpm extension:zip`: the current Chrome package builds successfully.
- `pnpm smoke:preview`: nine checks pass, including both sample PNG dimensions,
  actual extension assets, local fonts, same-origin framing and blocked API
  connections in the sample frame.
- `pnpm smoke:local`: ten checks pass against a real public GitHub repository:
  inspect, immutable-commit twelve-panel generation, 1600 × 3540 PNG download,
  persistent listing, scoped disposable deletion, malformed-input rejection and
  local origin/Host protections. No image-provider calls were made.
- Browser: saved-comic selection resets the repository context correctly;
  twelve local sample images compose in the web and real extension preview;
  the downloaded browser PNG is 1600 × 3540. Web at 320 px and extension at
  390 px have no horizontal document overflow. No web console errors were seen.
- Provider request/response shapes were checked against official OpenAI Image
  API and Google Interactions image documentation; protocol/error cases use mocks.
- The GitHub CI result is recorded on PR #1 for the final pushed commit.

## Setup and acceptance boundaries

Hosted extension OAuth now requires the installed extension ID(s) in the
server's comma-separated `ALLOWED_EXTENSION_IDS`. Empty permits web login only.
Local mode uses no OAuth and needs no such setting. See `HOSTED_SETUP.md`.

Real paid OpenAI/Gemini generation, installed-Chrome permissions and authenticated
hosted Supabase/Storage/Trigger flows were not exercised. No paid provider key was
provisioned or used. Supabase query tests use its actual SDK with mocked HTTP;
migration tests use embedded PostgreSQL. These do not prove hosted acceptance.
Existing downloaded comics and their historical captions were preserved.

## Official protocol references

- [OpenAI Image API](https://developers.openai.com/api/reference/resources/images/methods/generate)
- [Google image generation](https://ai.google.dev/gemini-api/docs/image-generation)
- [Google Interactions schema migration](https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026)
- [Supabase maybeSingle](https://supabase.com/docs/reference/javascript/using-modifiers-maybesingle)
- [Supabase greater-than filter](https://supabase.com/docs/reference/javascript/using-filters-gt)
