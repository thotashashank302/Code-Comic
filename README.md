# Comic Code

Turn a public GitHub repository into a four-panel comic with evidence links.
The default local mode runs on your computer: no login, database account,
background-worker account, AI key, or hosting subscription is required.

## Start

Install Node.js 24+ and pnpm 11.11.0, then run from this repository:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:3000**, paste a GitHub repository URL, inspect it, and
choose **Generate fixed comic**. Download the PNG or reopen it from **Saved
comics** after a restart. Leave the Cloudflare fields empty for the free flow.

## Preview without using API quota

Choose **Explore a sample** or **Try the sample** to inspect the bundled example
story and evidence without contacting GitHub or Cloudflare. The sample is labeled
illustrative; it does not pretend to be a fresh scan. You can download its PNG.

Open **http://127.0.0.1:3000/extension** for the actual built side-panel interface
in a browser. Explain, Story, Evidence and compact-layout controls work with sample
data. Its browser-served preview blocks all `connect-src` requests with CSP. The
installed Chrome extension also has an **Explore sample** control. Live OAuth,
private repository access and provider quota behavior still need separate tests.
`pnpm dev` and `pnpm build` generate the extension preview automatically.
With the server running, `pnpm smoke:preview` checks preview assets, fonts,
framing policy and the sample PNG without consuming provider quota.

The free result uses bounded structural analysis and bundled artwork. It
identifies patterns in sampled files; it does not provide AI semantic analysis
or prove that the repository is correct. A scan selects up to 40 files and
150,000 characters at the inspected commit. Branches containing slashes work.

## What “free” means

- Local generation, storage and PNG export make no paid API calls.
- GitHub access still needs internet. Anonymous REST access has a limit of
  [60 requests per hour per IP](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
  A large scan can use most of that allowance. An optional server-side
  `GITHUB_TOKEN` raises the limit; no token is needed to start.
- Optional Cloudflare semantic analysis and four generated images use **your**
  account and may require a paid plan or consume paid quota. They are never
  called unless you supply credentials and request AI generation. Check
  [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
  A failed AI request preserves the completed free comic.
- Public hosting, private repository login and online share links need the
  separate [hosted setup](docs/HOSTED_SETUP.md). Their free tiers are limited;
  unlimited hosted AI generation is not promised.

## Local data and limits

Local mode accepts public repositories only, even if the optional token can read
private code. It is a single-user desktop server bound to loopback by `pnpm dev`.
Requests using public hostnames and cross-site mutations are rejected. Installed
Chrome extensions may access it through their declared localhost host permission.
Do not tunnel or reverse-proxy local mode to the internet or run several server
processes against the same data directory.

Completed analysis, evidence locators and PNG bytes are saved atomically under
`apps/web/.comic-code/` when launched with the commands above. Raw source and
Cloudflare credentials are not persisted. The directory is ignored by Git;
new directories/files use owner-only permissions where the OS supports them.
Records expire after 30 days and are removed on the next read/list. There is a
100-record storage cap and a 25-generation daily safety limit over retained
records. Download comics you want to keep. Delete removes the local record and
its PNG; it cannot revoke a previously downloaded copy.

To adjust local configuration, copy `.env.example` to `.env`. Set
`COMIC_CODE_DATA_DIR` to an absolute directory for a persistent disk location.
Keep secrets in the ignored `.env`; never put tokens in public-prefixed variables.
Use `COMIC_CODE_MODE=hosted` for the authenticated service-backed runtime.

## Chrome extension

Keep the local server running, then build:

```bash
pnpm extension:build
# Or create a distributable ZIP:
pnpm extension:zip
```

Load `apps/extension/.output/chrome-mv3` at `chrome://extensions` using
**Developer mode → Load unpacked**. Open a GitHub repository and select its
**Explain repository** button. The side panel detects the local server and
needs no OAuth login. Local mode supports generation and PNG download; online
sharing requires hosted mode. The extension saves Cloudflare credentials in
Chrome local storage only when you enter them; use its removal control to clear
them.

For a hosted extension, set `WXT_PUBLIC_API_BASE_URL` to the final HTTPS origin
before building. The manifest grants access to that exact API origin.

## Where to enter your API key (BYOK)

- **Web:** select **API key / BYOK** in the top navigation. The settings are
  available before inspecting a repository.
- **Extension:** expand **API key / BYOK** just below the header, from any tab.
- Enter your **Cloudflare Account ID** and a **Workers AI API token** with
  Workers AI Read and Edit permissions. Use the
  [Cloudflare credential guide](https://developers.cloudflare.com/workers-ai/get-started/rest-api/).
  A Global API key or a key from another provider will not work here.
- Web credentials stay in the current tab; extension credentials are saved
  locally when you generate. Use **Clear credentials** or **Remove saved
  credentials** to remove them. There is no provider call just for entering a key.
- Sample mode shows the field placement with inputs disabled. It never uses or
  saves keys. Inspect a real repository, then request AI generation to use BYOK.

Free bundled artwork continues to work without a key. A Cloudflare token does
not raise GitHub's request limit; the optional server-side `GITHUB_TOKEN` is
configured separately in `.env`.

## Project structure

```text
apps/web/             Next.js UI, APIs, local runtime, optional hosted worker
apps/extension/       Chrome Manifest V3 side panel and GitHub page integration
packages/comic/       Grounded analysis, optional providers and PNG composition
packages/contracts/   Shared request and response validation
packages/github/      GitHub access, file selection, source masking and evidence
packages/database/    Optional Supabase repository and private artifact storage
supabase/             Hosted database migrations
scripts/              Repeatable local extension packaging
docs/                Setup, deployment and debugging evidence
docs/archive/        Historical implementation and hackathon documents
```

## Check and build

```bash
pnpm check
pnpm audit --prod
# With the local server running, check the real public GitHub flow:
pnpm smoke:local
```

`pnpm check` runs tests, lint, formatting, web/extension production builds and
TypeScript checks. The web production build uses webpack for compatibility with
restricted build environments. To run the built web app locally:

```bash
pnpm --filter @comic-code/web start --hostname 127.0.0.1
```

See [the debugging report](docs/DEBUGGING_REPORT.md) for reproduced defects,
fixes, test results and the limits of hosted verification.

[Security model](SECURITY.md) · [Hosted deployment](docs/DEPLOYMENT_CHECKLIST.md) · [MIT license](LICENSE)
