# Comic Code

Turn a public GitHub repository into a four- or twelve-panel comic with evidence links.
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
comics** after a restart. Leave the API key empty for the free flow.

## Preview without using API quota

Choose **Explore a sample** or **Try the sample** to inspect the bundled example
story and evidence without contacting GitHub or image providers. The sample is labeled
illustrative; it does not pretend to be a fresh scan. You can download its PNG. Twelve panels are selected by default; choose four
for a quick overview. Existing saved comics keep their original length.

To test image composition without an API key, open **Use your own images · no
API key**, choose **Load sample artwork**, then **Compose 12-panel PNG**. You
can also copy each panel prompt into an image tool manually and choose the
resulting PNG/JPEG/WebP files. Files stay in browser memory; download the result
before closing or changing the story. See [the manual artwork guide](docs/MANUAL_ARTWORK.md).

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
- Optional OpenAI or Google Gemini image generation uses **your own API key**.
  Four or twelve panel images use your selected provider's quota and billing. Free API
  access is not guaranteed. Captions and evidence come from the saved storyboard
  and are not rewritten by the image provider. A failed request preserves the
  existing comic. See [image BYOK setup](docs/IMAGE_BYOK.md).
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
Image API keys are not persisted. The directory is ignored by Git;
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
sharing requires hosted mode. Image API keys stay in side-panel memory and are cleared when the panel
closes or you select **Clear API key**. Old saved Cloudflare credentials are
removed automatically when the updated extension initializes.

For a hosted extension, set `WXT_PUBLIC_API_BASE_URL` to the final HTTPS origin
before building. The manifest grants access to that exact API origin.

## Where to enter your API key (BYOK)

- **Web:** select **API key / BYOK** in the top navigation.
- **Extension:** expand **API key / BYOK** below the header, from any tab.
- Choose **OpenAI** or **Google Gemini**, choose an image model available to your
  account, and enter that provider's API key. Keys from other providers are not
  interchangeable. Switching providers clears the entered key.
- Generate a comic or select **Generate 4 AI panels** or **Generate 12 AI panels** on a saved comic. One
  provider request per panel creates an illustration; captions and evidence stay intact.
- Keys remain in current tab/panel memory. **Clear API key** removes the value.
  There is no API call just for entering a key or changing a provider.
- Sample mode lets you inspect providers/models with key entry disabled. No
  provider calls or credential storage occur in samples.

Free bundled artwork works without a key. Image-provider keys do not raise
GitHub's independent request limit; configure an optional server-side
`GITHUB_TOKEN` separately in `.env`. Read the [setup and privacy details](docs/IMAGE_BYOK.md).

## Project structure

```text
apps/web/             Next.js UI, APIs, local runtime, optional hosted worker
apps/extension/       Chrome Manifest V3 side panel and GitHub page integration
packages/comic/       Grounded analysis, optional providers and PNG composition
packages/contracts/   Shared request and response validation
packages/ui/          Browser-only manual artwork studio and PNG export
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

GitHub Actions uses [`.github/workflows/ci.yaml`](.github/workflows/ci.yaml).
It checks PRs when opened, updated, reopened or marked ready for review, as well
as pushes to `main`. A manual trigger is available once the workflow is on the
default branch. Draft PRs run checks too. The job runs `pnpm check`, extension
packaging and the production dependency audit; it needs no AI keys or hosted
service credentials. CI reports results on the PR and does not merge it.

See [the debugging report](docs/DEBUGGING_REPORT.md) for reproduced defects,
fixes, test results and the limits of hosted verification.

[Security model](SECURITY.md) · [Hosted deployment](docs/DEPLOYMENT_CHECKLIST.md) · [MIT license](LICENSE)
