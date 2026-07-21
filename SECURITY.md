# Security policy

## Scope

Comic Code handles private source code and treats pull-request titles, descriptions, paths, patches, and generated model output as untrusted.

## Implemented controls

- OAuth state and PKCE with a ten-minute encrypted flow cookie.
- Authenticated/encrypted seven-hour session JWE; browser cookies are HttpOnly, SameSite Lax, and Secure in production.
- Bearer sessions returned to the extension only in the `chromiumapp.org` URL fragment.
- Read-only GitHub permissions and separate user-access plus installation-access checks for private repositories.
- Server verification of repository, PR number, selected paths, and captured head SHA.
- Exclusion of `.env`, credentials, lockfiles, binary, generated, vendored, minified, and oversized reconstructed files.
- Secret/token/email/connection-string masking plus high-entropy masking.
- Prompt-injection boundaries, strict Zod structured output, no model tools, and opaque safety identifiers.
- Independent claim verification and deterministic evidence-ID checks.
- Verbatim-evidence leak rejection before persistence.
- Private Storage, five-minute signed asset URLs, 256-bit share capabilities stored only as HMAC hashes, and no-store/no-referrer share pages.
- Forced RLS and no anon/authenticated table grants.
- Tombstone-first deletion, worker tombstone checks, artifact cleanup, Trigger.dev cancellation, and daily retention.
- CSP, frame denial, HSTS, no-sniff, restrictive permissions policy, CSRF origin checks, webhook HMAC verification, quotas, and bounded request bodies.
- Cloudflare BYOK credentials accepted only on authenticated, same-origin analysis/artwork requests; strict Account ID/token bounds; provider errors reduced to safe codes; credentials excluded from persistence, Trigger.dev, analytics, and audit metadata.
- BYOK source context is secret-masked, bounded, and sent to Cloudflare only after an explicit user action; model output passes strict schema, grounding, leak, and safety validation.
- BYOK artwork uploaded under a new random object path and swapped only after successful composition; failed regeneration preserves prior comic.

## Data that is persisted

Repository/PR coordinates, captured SHAs, selected/excluded file paths, evidence line locators and hashes, sanitized claims/storyboard text, generated PNG paths, usage counts, progress, and low-cardinality audit metadata.

Raw patches, source blobs, prompt bodies containing source, GitHub access tokens, OAuth codes, share tokens, and provider request bodies are not persisted.

Cloudflare Account IDs and API tokens are not persisted by Comic Code. Web values remain in tab memory. Extension values remain in `chrome.storage.local` on the user's device until removed. API tokens and masked selected code context cross the Comic Code server transiently over HTTPS for Cloudflare Llama and FLUX calls. Tokens must be dedicated and scoped only to Workers AI.

## Residual considerations

- Cloudflare receives the masked source context in BYOK mode under the user's Cloudflare account and applicable Cloudflare data-usage terms; Comic Code does not present that path as Zero Data Retention.
- A revoked share may retain an already minted signed asset URL for at most five minutes.
- The encrypted extension session is still a bearer capability and expires after seven hours. Chrome extension storage must be treated as sensitive.
- Public-repository fallback uses unauthenticated GitHub API capacity and may be rate limited.
- Chrome, not the extension, controls left/right side-panel placement.
- A local extension credential can be read by Comic Code extension code and anyone controlling that Chrome profile. Users should create a dedicated least-privilege Workers AI token and revoke it if the device or extension becomes untrusted.
- A complete live review must test the deployed GitHub, Supabase, Trigger.dev, Cloudflare BYOK, and Vercel configuration with real credentials.

## Dependency status

On 2026-07-20, `pnpm audit --prod` reported no known vulnerabilities after scoped overrides to patched transitive versions. Re-run the audit before every release.

## Reporting

Do not include private source, secrets, tokens, or full request logs in a report. Revoke affected credentials first, then provide a minimal reproduction through the repository’s private security-reporting channel.
