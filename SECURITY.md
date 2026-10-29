# Security

## Local runtime

The default runtime is a single-user desktop service. It accepts public GitHub
repositories only, with no OAuth session or remote database. Its proxy and API
handler reject non-loopback hosts and origins. Mutations require a same-port
loopback origin or a Chrome extension origin; bearer strings do not bypass this
check. This trusts locally installed browser extensions and local processes.
It is not an authentication boundary against another user on the same computer.
Use `pnpm dev` or `next start --hostname 127.0.0.1`; do not expose it through a
tunnel or reverse proxy. Vercel defaults to hosted mode and requires the hosted
credentials. The `/api/local` handler returns 404 in hosted mode.

Local persistence contains sanitized analysis, evidence locators and PNG bytes,
never source or provider credentials. Writes replace complete records atomically
using owner-only file permissions. One server process per data directory is
supported, with one mutation at a time. Expired records are removed lazily on
read/list, including their PNG bytes. Local deletion removes the complete file.
Downloaded copies cannot be revoked. Online capability sharing is unavailable
in local mode. See the README for storage and generation limits.

## Hosted runtime

## Scope

Comic Code handles private source code and treats repository names, descriptions, README content, manifests, paths, source, and generated model output as untrusted.

## Implemented controls

- OAuth state and PKCE with a ten-minute encrypted flow cookie.
- Authenticated/encrypted seven-hour session JWE; browser cookies are HttpOnly, SameSite Lax, and Secure in production.
- Bearer sessions returned to the extension only in the `chromiumapp.org` URL fragment.
- Read-only GitHub permissions and separate user-access plus installation-access checks for private repositories.
- Server verification of repository access, requested ref, and captured immutable commit SHA.
- Exclusion of `.env`, credentials, lockfiles, binary, generated, vendored, minified, and oversized reconstructed files.
- Secret/token/email/connection-string masking plus high-entropy masking.
- Prompt-injection boundaries, strict Zod structured output, no model tools, and opaque safety identifiers.
- Independent claim verification and deterministic evidence-ID checks.
- Verbatim-evidence leak rejection before persistence.
- Private Storage, five-minute signed asset URLs, 256-bit share capabilities stored only as HMAC hashes, and no-store/no-referrer share pages.
- Forced RLS and no anon/authenticated table grants.
- Tombstone-first deletion, worker tombstone checks, artifact cleanup, Trigger.dev cancellation, and daily retention.
- CSP, frame denial, HSTS, no-sniff, restrictive permissions policy, CSRF origin checks, webhook HMAC verification, quotas, and bounded request bodies.
- Image BYOK requests require the existing local-origin or hosted authentication/ownership/repository-access checks. Provider/model/key combinations are validated strictly; only fixed official OpenAI and Gemini endpoints are used, with redirects disabled. Keys are excluded from persistence, Trigger.dev, analytics and audit metadata.
- Image BYOK sends only sanitized illustration prompts from the saved storyboard, after an explicit generation action. No raw source or evidence bodies are sent. JSON responses, base64 data, raster signatures and decoded pixels are bounded; remote image URLs are never followed. Provider response/error bodies are never logged or returned to clients.
- BYOK artwork uploaded under a new random object path and swapped only after successful composition; failed regeneration preserves prior comic.

## Data that is persisted

Repository coordinates, captured ref and commit SHA, scan summary, selected/excluded file paths, evidence line locators and hashes, sanitized claims/storyboard text, generated PNG paths, usage counts, progress, and low-cardinality audit metadata.

Raw patches, source blobs, prompt bodies containing source, GitHub access tokens, OAuth codes, share tokens, and provider request bodies are not persisted.

OpenAI and Gemini image keys remain in webpage tab or extension panel memory;
they are not saved in Chrome storage. They cross the Comic Code server
transiently and authenticate only with the selected provider. Hosted traffic
uses HTTPS; local traffic stays on loopback. The extension removes obsolete
saved Cloudflare credentials during initialization. Gemini Interactions calls
set `store: false`; provider-specific data policies still apply.

## Residual considerations

- The selected image provider receives illustration prompts under the user's account and applicable provider data policies. Image generation does not verify the storyboard's claims or guarantee text-free artwork.
- A revoked share may retain an already minted signed asset URL for at most five minutes.
- The encrypted extension session is still a bearer capability and expires after seven hours. Chrome extension storage must be treated as sensitive.
- Public-repository fallback uses unauthenticated GitHub API capacity and may be rate limited.
- Chrome, not the extension, controls left/right side-panel placement.
- Keys in tab/panel memory can be read by someone controlling that page or device. Use a dedicated provider key with suitable account limits and revoke it if compromised.
- A complete live review must test the deployed GitHub, Supabase, Trigger.dev, OpenAI/Gemini BYOK, and Vercel configuration with real credentials.

## Dependency status

On 2026-07-20, `pnpm audit --prod` reported no known vulnerabilities after scoped overrides to patched transitive versions. Re-run the audit before every release.

## Reporting

Do not include private source, secrets, tokens, or full request logs in a report. Revoke affected credentials first, then provide a minimal reproduction through the repository’s private security-reporting channel.

## Manual artwork

The shared browser artwork studio accepts PNG/JPEG/WebP files up to 8 MB each,
checks decoded images against a 40-megapixel limit, and composes four or twelve
panels on a local Canvas. It makes no upload or AI-provider requests. Object URLs
are revoked when artwork changes or the component closes. Manual artwork is not
added to persisted comics or shared artifacts. The extension browser preview
permits blob images while keeping API connections blocked.
