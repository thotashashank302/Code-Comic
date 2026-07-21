# Comic Code

Comic Code reads selected source files from a GitHub pull request and turns how the code works into a grounded four-panel comic. It includes a Chrome side-panel extension, a hosted Next.js demo, private Supabase storage, durable Trigger.dev jobs, and optional user-funded Cloudflare AI generation.

Built for the OpenAI Build Week hackathon in the **Work & Productivity** category.

## What works

- Public and private GitHub pull requests.
- Native Chrome 114+ side panel with an injected **Explain PR** button.
- GitHub App OAuth with state + PKCE and encrypted seven-hour sessions.
- Read-only repository access; private repositories require a GitHub App installation.
- Safe public-repository fallback without requiring an installation.
- File selection with a maximum of 20 files and 3,000 changed lines.
- Sensitive-file exclusion, secret masking, and high-entropy token detection.
- Full selected-file reading at the PR head, with diff locations used only to prioritize bounded source sampling.
- API-free structural scan that detects languages, control flow, validation, async work, data access, UI state, security checks, and tests.
- Optional Cloudflare BYOK pipeline: Llama analyzes and verifies transient code context, then FLUX creates four distinct panels using the user's own Workers AI allocation; creator credits are never used as a hidden fallback.
- Bundled visual-template fallback when artwork credentials or quota are unavailable.
- Private PNG storage, short-lived downloads, seven-day revocable share links, and deletion.
- Daily retention cleanup and a 25-generation-per-user safety limit.
- Desktop, mobile, and narrow side-panel layouts using the supplied indigo visual direction.

## Repository layout

```text
apps/web          Next.js App Router site, API, OAuth, Trigger.dev task
apps/extension    WXT Manifest V3 Chrome extension
packages/comic    Analysis prompts, validation, artwork, PNG composition
packages/contracts Shared Zod contracts
packages/database Supabase repository and private storage operations
packages/github   GitHub App client, source filtering, masking, evidence mapping
supabase          CLI config and timestamped database migration
```

## Security model

Raw source, reconstructed patches, and prompts containing source exist only in authenticated function or worker memory. They are never written to PostgreSQL, Storage, Trigger.dev payloads or outputs, audit metadata, analytics, or application logs.

Cloudflare BYOK Account IDs and API tokens are accepted only by the authenticated code-analysis/artwork route over HTTPS. They remain in webpage tab memory or Chrome extension local storage, are never placed in Trigger.dev payloads, and are never persisted by Comic Code servers, databases, logs, or audit records. Masked selected code context is sent transiently to Cloudflare for Llama analysis and claim verification; FLUX then generates four images. The user's Cloudflare account pays for both text and image inference.

The worker receives only an explanation UUID. It fetches selected files at the PR head, masks secrets, creates an API-free preview, and persists only sanitized claims, captions, evidence locators/hashes, and generated artwork. If a user supplies Cloudflare credentials, the authenticated web route refetches the same bounded source and sends it transiently to that user's Workers AI account.

See [SECURITY.md](./SECURITY.md) and [PR_EXPLAINER_IMPLEMENTATION_PLAN.md](./PR_EXPLAINER_IMPLEMENTATION_PLAN.md) for the threat model and acceptance criteria.

## Prerequisites

- Node.js 20.12+
- pnpm 11.11.0
- Chrome 114+
- Optional Cloudflare account for user-funded semantic analysis and FLUX artwork
- GitHub App
- Supabase project
- Trigger.dev project
- Vercel project for the hosted demo

## Environment setup

The repository-level `.env` is ignored by Git. Copy the example and add real values locally:

```bash
cp .env.example .env
```

| Variable                    | Used by         | Notes                                                              |
| --------------------------- | --------------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`       | Web             | `http://localhost:3000` locally; production HTTPS origin on Vercel |
| `WXT_PUBLIC_API_BASE_URL`   | Extension build | Same origin as the hosted web app                                  |
| `TRIGGER_SECRET_KEY`        | Web             | Trigger.dev DEV key locally, production key on Vercel              |
| `TRIGGER_PROJECT_REF`       | Trigger config  | `proj_...` from the Trigger.dev dashboard                          |
| `GITHUB_APP_ID`             | Web + worker    | Numeric GitHub App ID                                              |
| `GITHUB_CLIENT_ID`          | Web             | GitHub App OAuth client ID                                         |
| `GITHUB_CLIENT_SECRET`      | Web             | GitHub App OAuth client secret                                     |
| `GITHUB_PRIVATE_KEY_BASE64` | Web + worker    | Entire GitHub App PEM encoded as one base64 line                   |
| `GITHUB_WEBHOOK_SECRET`     | Web             | At least 32 random characters                                      |
| `GITHUB_APP_SLUG`           | Web             | Slug used by the install URL                                       |
| `NEXT_PUBLIC_SUPABASE_URL`  | Web + worker    | Project URL; no browser database access is used                    |
| `SUPABASE_SECRET_KEY`       | Web + worker    | Server-side secret/service key only                                |
| `SHARE_TOKEN_PEPPER`        | Web             | 32+ random bytes; changing it invalidates shares                   |
| `SAFETY_IDENTIFIER_SECRET`  | Web + worker    | 32+ random bytes                                                   |
| `SESSION_ENCRYPTION_SECRET` | Web             | 32+ random bytes; changing it signs everyone out                   |
| `CRON_SECRET`               | Web             | 32+ random bytes; Vercel sends it to cron routes                   |

Generate independent local secrets with `openssl rand -hex 32`. Do not reuse one value for multiple variables. Encode the GitHub PEM without line breaks, for example:

```bash
base64 < path/to/github-app.private-key.pem | tr -d '\n'
```

Only these variables belong in Trigger.dev: `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY_BASE64`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SAFETY_IDENTIFIER_SECRET`.

## GitHub App configuration

Create a GitHub App with:

- Homepage URL: `NEXT_PUBLIC_APP_URL`
- Callback URL: `NEXT_PUBLIC_APP_URL/api/v1/auth/github/callback`
- Webhook URL: `NEXT_PUBLIC_APP_URL/api/v1/github/webhooks`
- Webhook secret: `GITHUB_WEBHOOK_SECRET`
- Repository permissions: **Contents: Read-only**, **Pull requests: Read-only**, **Metadata: Read-only**
- No write permissions
- User authorization enabled
- Expiring user access tokens enabled

Public PRs work without installing the app on that repository. Private PRs require the user to install the app on the selected repository and still revalidate the signed-in user’s access.

## Supabase setup

The migration was created with Supabase CLI 2.109.1 and enables RLS/forced RLS, explicit service-role grants, constraints, indexes, retention fields, and a private 10 MB PNG bucket.

```bash
pnpm dlx supabase@2.109.1 login
pnpm dlx supabase@2.109.1 link --project-ref YOUR_PROJECT_REF
pnpm dlx supabase@2.109.1 db push
```

Do not paste the migration into the SQL editor manually. The application intentionally exposes no anon/authenticated table policies; all database access goes through authenticated server routes.

## Trigger.dev setup

From `apps/web`:

```bash
pnpm exec trigger.dev login
pnpm exec trigger.dev dev
```

After the task appears in the dashboard, sync only the worker variables listed above. Deploy the task with:

```bash
pnpm exec trigger.dev deploy
```

The task payload is `{ explanationId }`; it never includes source, patches, prompts, GitHub tokens, or captions.

## Local development

Install dependencies and run the web app:

```bash
pnpm install
pnpm --filter @comic-code/web dev
```

In another terminal, run Trigger.dev as described above. For extension hot reload:

```bash
pnpm --filter @comic-code/extension dev
```

Load the generated extension directory from `chrome://extensions` → **Developer mode** → **Load unpacked**.

Chrome controls whether side panels appear on the left or right. Comic Code reads the selected side and adapts its border treatment; users move it under Chrome **Settings → Appearance → Side panel**.

### User-funded artwork

Before generating, choose the image mode. Leave both fields empty for the fixed API-free comic, or provide:

- Cloudflare Account ID.
- API token with Workers AI Read and Workers AI Edit permissions.

Web credentials live only in current tab memory. Extension credentials use `chrome.storage.local` until the user selects **Remove saved credentials** or uninstalls the extension. With a valid key, generation automatically creates the fixed preview first, then refetches and masks bounded source from the selected files, asks Cloudflare Llama for a grounded story plus independent claim verification, generates four distinct FLUX panels with separate prompts and seeds, composes a new PNG, then atomically replaces the preview. Failures leave the fixed comic unchanged.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm audit --prod
pnpm --filter @comic-code/web build
pnpm --filter @comic-code/extension build
pnpm --filter @comic-code/extension zip
```

Current local verification:

- Production dependency audit: no known vulnerabilities.
- 23 unit/security/composition tests passing.
- TypeScript passing across all workspaces.
- ESLint passing with zero warnings.
- Next.js production build passing for every page and API route.
- WXT Chrome MV3 build and ZIP passing.
- Browser checks passing at 1280 px and 390 px with no runtime errors or horizontal overflow.

Live integration tests require real service credentials and a test PR; they cannot be meaningfully mocked as proof of deployment readiness.

## Deployment

See [docs/DEPLOYMENT_CHECKLIST.md](./docs/DEPLOYMENT_CHECKLIST.md) for the exact order. In short:

1. Push the Supabase migration.
2. Deploy the Trigger.dev task and worker environment.
3. Deploy `apps/web` on Vercel with the server environment.
4. Update the GitHub App URLs to the production origin.
5. Set `WXT_PUBLIC_API_BASE_URL` to the production origin and rebuild the extension.
6. If using a custom domain instead of `*.vercel.app`, add its exact origin to `host_permissions` before the final extension build.

Release artifacts are generated at:

- Unpacked extension: `apps/extension/.output/chrome-mv3`
- Chrome ZIP: `apps/extension/.output/comic-codeextension-0.1.0-chrome.zip`


## License

[MIT](./LICENSE)
