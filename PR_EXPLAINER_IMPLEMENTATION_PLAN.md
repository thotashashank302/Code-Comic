# Comic Code — Hackathon Implementation Plan

## 1. Objective

Build a deployable Chrome extension and companion web demo that turn a GitHub pull request into a grounded four-panel comic for nontechnical stakeholders.

The OpenAI Build Week submission targets the **Work & Productivity** category. The hackathon build must be functional, testable by judges, and explicit about how Codex and GPT-5.6 were used.

## 2. Hackathon Scope

### Included

- GitHub.com public and private pull requests.
- Chrome 114+ Manifest V3 extension using the native browser side panel.
- Companion web experience where judges can submit a public PR URL without installing the extension.
- GitHub user authentication plus a read-only GitHub App installation.
- A hard limit of 20 selected files or 3,000 changed lines per generation.
- Evidence-grounded storyboard generation with GPT-5.6 Terra.
- Four parallel GPT Image 2 illustrations with deterministic caption composition.
- PNG download, text-storyboard fallback, and revocable seven-day share links.
- Stale-head detection, quotas, idempotency, safe retries, and deletion.

### Deferred

- GitHub Enterprise Server, GitLab, and Bitbucket.
- Automatic PR comments and automatic generation.
- Organization billing, administration, compliance dashboards, and multilingual output.
- Chrome Web Store approval as a dependency for hackathon judging; provide an unpacked ZIP and hosted demo instead.

## 3. Architecture

Use a pnpm TypeScript monorepo:

- `apps/web`: Next.js App Router application and authenticated API, deployed on Vercel.
- `apps/extension`: WXT + React Chrome extension.
- `packages/contracts`: shared Zod schemas and TypeScript types.
- `packages/comic`: evidence validation, prompts, composition, and output policies.
- `packages/github`: GitHub App authentication, access checks, PR ingestion, and diff reconstruction.
- `packages/database`: Supabase queries and generated database types.
- `trigger`: durable generation tasks and retention jobs.

External services:

- OpenAI Responses API: `gpt-5.6-terra`, medium reasoning, strict structured output, `store: false`.
- OpenAI Image API: `gpt-image-2`.
- GitHub App: metadata, contents, and pull-request read permissions only.
- Supabase PostgreSQL and private Storage with RLS.
- Trigger.dev for background processing and progress.
- Sharp with SVG overlays for final composition.

## 4. Security and Privacy Contract

### Source-code handling

- Raw source, patch text, prompts containing source, and reconstructed diffs exist only in process memory.
- Raw source must never enter Postgres, Supabase Storage, Trigger.dev payloads, outputs, metadata, logs, analytics, or application error messages.
- OpenAI receives only bounded, filtered, secret-masked chunks. `store: false` disables Responses application-state storage but is not described as Zero Data Retention.
- Secret scanning covers added and deleted lines, high-entropy values, private keys, tokens, credentials, `.env` files, and sensitive path patterns.

### Untrusted input

- PR titles, descriptions, filenames, and diffs are untrusted data, not model instructions.
- Analysis requests expose no tools and require strict JSON schemas.
- Captions and scene prompts must not reproduce source code, secrets, customer data, internal URLs, or exact credentials.

### Authentication and authorization

- GitHub user authentication proves the human identity.
- A short-lived GitHub installation token provides repository access but never substitutes for user authorization.
- Every explanation, download, share, regenerate, and delete action revalidates ownership or current repository access.
- Client-provided owner, repository, PR number, selected files, and SHA values are untrusted and verified server-side.

### Persistence

- Persist only minimal PR metadata, base/head SHAs, file/line locators, evidence hashes, claims, panels, artwork, usage, and audit events.
- Never persist `diffHunk` or raw evidence text.
- Private Storage objects use owner-aware RLS and short-lived signed URLs.
- Share tokens contain at least 256 bits of entropy and are stored only as keyed hashes.
- Share pages use `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, strict CSP, and `noindex`.
- Asset URLs issued through a share expire in at most five minutes so revocation becomes effective quickly.

### Deletion and retention

- Generated artifacts expire after 30 days; share records expire after seven days.
- Deletion first creates a tombstone and cancels active work, then removes Storage objects through the Storage API and deletes active metadata.
- Workers check the tombstone before every persisted stage so retries cannot recreate deleted artifacts.
- A scheduled retention task and orphan sweep verify cleanup.

## 5. Evidence Model

Transient analysis evidence contains the masked patch text in memory. Persisted evidence does not.

```ts
type PersistedEvidenceLocator = {
  id: string
  source: 'diff' | 'pull_request_title' | 'pull_request_description'
  filePath?: string
  oldPath?: string
  status?: 'added' | 'modified' | 'removed' | 'renamed'
  oldStart?: number
  oldEnd?: number
  newStart?: number
  newEnd?: number
  contentHash: string
}

type GroundedClaim = {
  id: string
  text: string
  support: 'direct' | 'inferred'
  evidenceIds: string[]
  confidence: 'high' | 'medium' | 'low'
}
```

Validation has two layers:

1. Deterministic checks ensure every evidence ID resolves, locators belong to the captured base/head comparison, word limits pass, and every panel contains at least one claim.
2. A separate structured verification pass classifies whether each claim is entailed, merely inferred, or unsupported. Unsupported claims are removed; inferred claims receive visible uncertainty language.

The panel template may state “No user-visible impact” for refactors and may adapt its wording for documentation-only changes. It must never invent business impact merely to fill a panel.

## 6. Processing Flow

1. Detect a GitHub PR route or accept a public PR URL in the hosted demo.
2. Authenticate the user and verify the GitHub App installation for private repositories.
3. Capture and server-verify base and head SHAs.
4. List changed files, apply safe exclusions, and enforce the hackathon limits.
5. Detect missing patches; fetch base/head blobs and reconstruct selected diffs when necessary.
6. Scan and mask secrets while preserving evidence line mapping.
7. Analyze bounded chunks without placing source in a queue payload.
8. Combine chunk findings into a strict four-panel storyboard.
9. Run claim-level grounding verification and uncertainty rewriting.
10. Persist the sanitized storyboard and evidence locators only.
11. Generate four illustrations concurrently, with no required text in the images.
12. Reject artwork containing unwanted OCR text or preserve the storyboard when artwork fails.
13. Compose the 1600×1200 comic deterministically.
14. Store private artifacts, record usage, and publish progress.
15. Recheck the current PR head before display and mark outdated results.

## 7. Core API

- `POST /api/v1/explanations`: validate access, limits, quotas, and idempotency; enqueue generation.
- `GET /api/v1/explanations/{id}`: return an authorized explanation and short-lived assets.
- `GET /api/v1/jobs/{id}`: authenticated job state and reconnectable progress.
- `POST /api/v1/explanations/{id}/shares`: create an expiring bearer share.
- `GET /api/v1/shares/{token}`: validate and exchange a share capability without leaking the secret to logs.
- `DELETE /api/v1/shares/{id}`: revoke a share.
- `DELETE /api/v1/explanations/{id}`: tombstone, cancel, and delete an explanation.
- `POST /api/v1/github/webhooks`: verify signatures and react to installation changes.
- `GET /api/v1/auth/github/callback`: complete GitHub user authentication.
- `GET /api/v1/cron/retention`: authenticated retention and orphan cleanup.

## 8. Acceptance Criteria

- A “normal” PR is at most 20 eligible files, 3,000 changed lines, and the configured analysis-token limit.
- p95 from accepted request to storyboard is below 90 seconds; p95 to composed comic is below three minutes under two concurrent pilot jobs.
- 100% of persisted evidence IDs resolve to valid locators for the captured comparison.
- No unsupported claim is intentionally displayed; all inference is labelled.
- Raw source and diffs are absent from application databases, Storage, queue data, logs, and error monitoring.
- Users cannot access another user’s private explanation through ID guessing or stale repository access.
- Expired and revoked share capabilities cannot mint new asset URLs.
- The text fallback remains usable when any image call fails.
- The extension ZIP installs successfully and the public hosted demo works from a clean browser session.

## 9. Verification

- Unit tests: URL parsing, file filters, secret masking, line mapping, evidence validation, share hashing, and authorization policies.
- Integration tests: GitHub fixtures, truncated patches, stale SHAs, model schema failures, retries, tombstones, and Storage cleanup.
- Browser tests: extension install path, GitHub login, generation, progress, download, share, revoke, delete, and web-demo flow.
- Security tests: IDOR, CSRF, prompt injection, token leakage, CORS, webhook signatures, RLS, signed-URL expiry, log inspection, and deletion races.
- Model evaluation: representative UI, API, database, infrastructure, refactor, and documentation PRs with claim-level human review.

## 10. Hackathon Deliverables

- Public or judge-accessible repository with a relevant license.
- README with architecture, local setup, sample PRs, installation, testing, deployment, and a clear account of Codex/GPT-5.6 usage.
- Hosted Vercel demo and downloadable unpacked extension ZIP.
- Public YouTube demo under three minutes with voiceover.
- Devpost description written in the submitter’s own voice.
- `/feedback` Codex Session ID from the primary implementation task.
