# OpenAI Build Week submission checklist

## Project fields

- Project name: **Comic Code**
- Category: **Work & Productivity**
- Hosted production URL
- Repository URL
- MIT license present
- Clear install/test instructions copied from the README

For a private repository, invite both required judging addresses listed by Devpost and verify access before submitting.

## Required demo

- Public YouTube video.
- Under three minutes.
- Voiceover included.
- Show the GitHub PR, injected extension button, side-panel progress, grounded comic, evidence map, PNG download, share/revoke, and hosted demo.
- Explain where Codex and GPT-5.6 were used.
- Do not show `.env`, tokens, private source, dashboards containing secrets, or full internal logs.

## Suggested video timing

- 0:00–0:20 — problem and one-sentence value proposition.
- 0:20–1:20 — extension flow on a public sample PR.
- 1:20–1:55 — evidence grounding, privacy, and private-repository controls.
- 1:55–2:25 — hosted demo, download, and revocable share.
- 2:25–2:50 — architecture and how Codex/GPT-5.6 were used.
- 2:50–3:00 — impact and closing.

## Final technical proof

- Public PR works without app installation.
- Private PR works only for an authorized user and installed repository.
- Browser extension ZIP installs in a clean profile.
- Hosted demo works in a clean browser session.
- Production audit has no known vulnerabilities.
- No raw source or tokens appear in persistence or logs.
- Share expiry/revocation and deletion are verified.
- Text fallback remains useful when image generation is unavailable.

## Codex feedback

- Run `/feedback` in the primary Codex implementation task.
- Copy the returned session ID into the required Devpost field.
- Write the final Devpost description in the submitter’s own voice.

## Before clicking submit

- Recheck the exact deadline and timezone in Devpost.
- Open every link from a signed-out browser.
- Confirm video visibility is Public, not Unlisted if the rules require Public.
- Confirm repository reviewers can access private code.
- Save a local copy of the final description and submission screenshots.
