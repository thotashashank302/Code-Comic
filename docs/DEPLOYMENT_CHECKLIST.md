# Deployment checklist

Follow this order so no public endpoint points at an unconfigured worker or database.

## 1. Local credential check

- Fill the ignored repository `.env`.
- Use independent 32-byte values for the share pepper, safety identifier, session encryption, webhook, and cron secrets.
- Confirm the GitHub private key is a one-line base64 value.
- Keep all secret values out of shell history, screenshots, tickets, and chat.

## 2. Supabase

```bash
pnpm dlx supabase@2.109.1 login
pnpm dlx supabase@2.109.1 link --project-ref YOUR_PROJECT_REF
pnpm dlx supabase@2.109.1 db push
```

Verify:

- `explanations`, `shares`, `usage_events`, and `audit_events` exist.
- RLS and forced RLS are enabled.
- anon/authenticated roles have no table grants.
- `comic-artifacts` exists and is private with a 10 MB PNG limit.

## 3. Trigger.dev

From `apps/web`:

```bash
pnpm exec trigger login
pnpm exec trigger dev
pnpm exec trigger deploy
```

Set only the worker environment listed in the README. Confirm the deployed task ID is `generate-comic` and its concurrency limit is two.

## 4. Vercel

- Create a Vercel project with **Root Directory** `apps/web`.
- Add every web environment variable from the README for Production and Preview as appropriate.
- Set `NEXT_PUBLIC_APP_URL` to the final production HTTPS origin.
- Set `CRON_SECRET`; the daily retention schedule is in `apps/web/vercel.json`.
- Deploy and confirm `/api/health` returns a no-store success response.
- Confirm security headers on `/` and no-store/no-referrer/noindex headers on `/share/test`.

## 5. GitHub App

Update the production URLs:

- Callback: `/api/v1/auth/github/callback`
- Webhook: `/api/v1/github/webhooks`
- Homepage: production origin

Confirm the webhook delivery receives HTTP 202 and the app has no write permissions.

## 6. Extension

- Set `WXT_PUBLIC_API_BASE_URL` in `.env` to the production origin.
- The extension build derives its exact host permission from that URL. Inspect the built manifest; no manual domain edit is needed.
- Run:

```bash
pnpm --filter @comic-code/extension icons
pnpm --filter @comic-code/extension build
pnpm --filter @comic-code/extension zip
```

- Load `apps/extension/.output/chrome-mv3` unpacked in a clean Chrome profile.
- Verify toolbar click, injected **Explain Repository**, login, progress, story, evidence, download, share, compact mode, and sign-out.

## 7. Live acceptance test

Test one public and one private repository:

1. Inspect the repository and capture the displayed commit SHA.
2. Confirm automatic representative-file selection stays under the limits.
3. Generate a storyboard and artwork.
4. Confirm every displayed claim has evidence.
5. Inspect database/Trigger/Vercel logs for absence of raw repository source and tokens.
6. Download the PNG.
7. Create, open, and revoke a share.
8. Delete the explanation and confirm subsequent access fails.
9. Move a test branch after inspection and confirm generation still reads the captured immutable commit.
10. Inspect a slash-containing branch (for example `feature/fix`) in both clients and confirm the resulting explanation retains that branch.
11. Simulate a Trigger dispatch failure, then retry; confirm the row becomes retryable and a comic completes.

## 8. Release gate

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm audit --prod
pnpm --filter @comic-code/web build
pnpm --filter @comic-code/extension zip
```

Do not publish the extension ZIP or submit Devpost until every command and the live acceptance test pass.

## Merge-readiness verification (2026-09-30)

- CI runs tests, lint, formatting, web build, typecheck, extension packaging, and the production dependency audit on every PR update.
- Local PostgreSQL tests execute the migration SQL verbatim on a fresh schema and on a schema containing a legacy PR row. They verify row conversion, forced RLS, revoked API-role grants, private bucket metadata, file/SHA/JSON constraints, and the new shares index. Supabase roles and the storage bucket catalog are supplied as fixtures; these tests do not verify a hosted Supabase project or Storage API.
- Apply and verify migrations before deploying the matching worker and web code. Previously built extension ZIPs use the retired request contract and must be rebuilt.
- Keep the PR draft until a matching Trigger worker and hosted public/private generation, BYOK, download, share/revoke, and deletion pass. Then request independent review and merge only after approval and green CI.
- At this review, the Supabase connector returned both ComicCode projects as inactive, the Vercel connector listed no accessible projects, and Trigger CLI was signed out. Hosted migrations and authenticated end-to-end acceptance were not run.
