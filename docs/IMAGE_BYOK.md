# Bring your own image AI

Comic Code supports **OpenAI** and **Google Gemini** image keys. Cloudflare
Account IDs, Workers AI tokens and FLUX generation have been removed from the
active generation flow. Existing Cloudflare-generated comics remain readable.

## Use it

1. Open **API key / BYOK** in the web navigation, or below the extension header.
2. Choose the provider and an image model available to your account.
3. Enter that provider's API key in the masked field.
4. Inspect a repository and generate a comic, or select **Generate 4 AI panels**
   on a saved comic. Four requests create four illustrations; Comic Code adds
   the saved captions and composes the PNG.

| Provider      | Default                  | Other available choices                             | Key                                                     |
| ------------- | ------------------------ | --------------------------------------------------- | ------------------------------------------------------- |
| OpenAI        | `gpt-image-2`            | `gpt-image-1.5`, `gpt-image-1-mini`                 | [OpenAI Platform](https://platform.openai.com/api-keys) |
| Google Gemini | `gemini-nano-banana-2.1` | `gemini-3.1-flash-lite-image`, `gemini-3-pro-image` | [Google AI Studio](https://aistudio.google.com/apikey)  |

Provider keys are not interchangeable. Switching providers clears the field.
**Clear API key** removes the entered key. Model selection and key entry make
no provider calls. Sample mode allows provider/model exploration but disables
key entry and generation. Free bundled artwork remains available without a key.

## What changes, what is sent

BYOK here generates **images**. It does not rewrite captions, verify claims or
turn a structural scan into semantic AI analysis. It illustrates the existing
storyboard, avoiding another source scan or GitHub file fetch. The hosted route
still rechecks repository access before using a saved private comic.

Keys stay in current tab/panel memory. They pass through the Comic Code backend
to authenticate with the chosen provider; they are not saved in server storage,
Chrome storage, jobs, audit events or logs. Updated extensions automatically
remove obsolete saved Cloudflare credentials. Only sanitized illustration
prompts are sent to the image API, without raw source or evidence bodies.
Provider-specific data policies apply. Gemini requests disable interaction
storage with `store: false`.

## Requests and recovery

- OpenAI: `POST https://api.openai.com/v1/images/generations`, bearer key,
  base64 image responses. See the [official Image API](https://developers.openai.com/api/reference/resources/images/methods/generate).
- Gemini: `POST https://generativelanguage.googleapis.com/v1beta/interactions`,
  `x-goog-api-key`, inline images from completed `model_output` steps. Thought
  images are ignored. See [Google image generation](https://ai.google.dev/gemini-api/docs/image-generation)
  and [Interactions REST schema](https://ai.google.dev/api/interactions-api).
- Official endpoints and provider-specific model choices are fixed. Arbitrary
  base URLs and URL-only outputs are rejected. Keys are never placed in URLs;
  redirects are disabled.
- Four distinct prompts run concurrently, with a 180-second overall deadline.
  There are no automatic paid retries. A failure aborts remaining requests;
  requests already processed by a provider may still consume quota or credits.
- Responses are byte-bounded; only PNG/JPEG/WebP signatures are accepted and
  decoded image size is limited. Images are normalized to PNG before composition.
- Invalid keys, exhausted quota, unavailable models, rejected prompts and
  outages have separate safe errors. Provider response bodies are not exposed.
  Existing PNGs are replaced only after all four images and composition succeed.

Billing, image-model access and quota belong to the user's provider account.
An API key does not guarantee free image generation or higher GitHub limits.

## Verification boundary

Protocol tests mock official provider responses and check key headers, distinct
prompts, raster decoding, invalid/missing images, thought-image exclusion,
response bounds, errors, redirect protection and secret exclusion. API tests
exercise real PNG composition and disk persistence without rereading GitHub,
plus hosted authorization and replacement cleanup using mocked services.

Live OpenAI/Gemini model acceptance requires a real user key, account access and
available quota. No real key is provisioned or used by the automated tests.
Hosted deployment and installation/permissions in Chrome are separate acceptance
checks.

On 28 October 2026, `pnpm check` passed 79 tests, lint, formatting, production
web/extension builds and all workspace typechecks. The browser check confirmed
provider/model switching, automatic key clearing between providers, masked key
entry and clearing, and disabled sample key entry. No live image-provider call
was made. The previously recorded in-app-preview MutationObserver diagnostic
remains; it did not block these controls and is not a claim of installed-Chrome
acceptance.
