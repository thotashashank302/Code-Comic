# Test and create a comic without image API credits

Comic Code defaults to **12 panels · detailed walkthrough**. Choose **4 panels ·
quick overview** for a shorter story. Select the length before generating a new
comic; existing saved comics keep their original length. Samples switch immediately.

## Test the image pipeline for free

1. Open the workspace and choose **Explore a sample**. No GitHub or image API calls occur.
2. Open **Use your own images · no API key** above the storyboard. In the extension,
   open the Story tab first.
3. Choose **Load sample artwork**. These are labeled local test images, not AI artwork.
4. Select **Compose 12-panel PNG**, then **Download 12-panel artwork PNG**.

This exercises image decoding, ordering, caption placement, preview and export.
It does not test a live AI provider, its image quality, credentials, billing or quota.
Four panels export at 1600 × 1200; twelve panels export at 1600 × 3540.

## Use images from Gemini or another tool manually

1. Expand a panel's prompt and copy it. Use one prompt at a time in your image tool.
   The **Open Gemini** link opens the consumer app; no API connection is made.
2. Generate one illustration per prompt and download each image yourself. The
   image tool's account access and limits still apply; Comic Code cannot grant credits.
3. Name the files `panel-01.png`, `panel-02.jpg`, and so on, or choose each file in
   its individual panel. Bulk selection assigns files in numeric filename order.
4. Review the thumbnails, compose, and download the finished PNG.

PNG, JPEG and WebP are accepted, up to 8 MB per file. Decoded images are limited
to 40 megapixels. All panels need an image before composition. Corrupt files
produce an error; previously composed artwork remains available if composition fails.

Files and composed artwork stay in browser memory. They are not uploaded to the
server, sent to an AI provider, added to saved comics, or included in share links.
Download before closing the tab/panel or switching the story. The app keeps the
existing captions and evidence; changing artwork does not verify or rewrite them.

## What the twelve panels explain

Generated structural stories cover the big picture, file organization, module
connections, functions/data shapes, validation, branches, UI/events, network,
storage, asynchronous work, error/access patterns, and verification. Each chapter
links to sampled evidence. A missing pattern is labeled uncertain; twelve panels
do not imply deeper semantic analysis or a verified running application.

Optional API generation still supports OpenAI and Gemini. It makes one image
request per panel, with at most three running concurrently and a shared 180-second
deadline. Twelve panels therefore use three times as many image requests as four.
See [BYOK details](IMAGE_BYOK.md). No provider calls are needed for this guide.

Hosted deployments must apply the new 32 MiB private-artifact bucket migration.
Local/manual tests require neither Supabase nor hosted infrastructure.
