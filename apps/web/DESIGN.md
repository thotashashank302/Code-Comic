---
name: Comic Code
description: A light pastel mosaic that makes source and its visual explanation feel connected.
colors:
  canvas: '#f0f0f0'
  text: '#141414'
  muted: '#586159'
  green: '#315e35'
  lime: '#e9efc8'
  line: '#dce0d6'
  white: '#fff'
  action: '#2c4c32'
  action-hover: '#476a3a'
  pale-action: '#e8edc4'
  pale-action-ink: '#24391f'
  pink: '#f9d9e9'
  cool-blue: '#cedce4'
  peach: '#f7efe6'
  extension-canvas: '#f3f5ed'
  extension-ink: '#162019'
  extension-action: '#345735'
  evidence-blue: '#e4edf0'
typography:
  display:
    fontFamily: 'Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: 'clamp(25px, 2.55vw, 36px)'
    fontWeight: 800
    lineHeight: 1.32
    letterSpacing: '-0.035em'
  title:
    fontFamily: 'Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '24px'
    fontWeight: 800
    letterSpacing: '-0.03em'
  body:
    fontFamily: 'Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '13px'
    lineHeight: 1.7
  label:
    fontFamily: 'Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: '12px'
    fontWeight: 700
  code:
    fontFamily: 'ui-monospace, SFMono-Regular, monospace'
rounded:
  field: '9px'
  inset: '12px'
  preview: '14px'
  panel: '22px'
  pill: '999px'
spacing:
  small: '10px'
  medium: '18px'
  large: '24px'
  workspace: '30px'
components:
  button-primary:
    backgroundColor: '{colors.action}'
    textColor: '{colors.white}'
    rounded: '{rounded.pill}'
    padding: '11px 20px'
  button-primary-hover:
    backgroundColor: '{colors.action-hover}'
    textColor: '{colors.white}'
  button-pale:
    backgroundColor: '{colors.pale-action}'
    textColor: '{colors.pale-action-ink}'
    rounded: '{rounded.pill}'
    padding: '11px 20px'
  button-secondary:
    backgroundColor: '{colors.white}'
    rounded: '{rounded.pill}'
    padding: '11px 20px'
  workspace:
    backgroundColor: '{colors.white}'
    rounded: '{rounded.panel}'
    padding: '{spacing.workspace}'
---

# Design System: Comic Code

## Overview

**Creative North Star: "Source becomes a clear visual story."**

The user-pinned world is a light SaaS mosaic: a gray canvas, pastel panels,
rounded white chrome, near-black type and restrained green actions. Unequal
panels and splayed source/comic windows give the introduction its character;
the working interface uses quieter white and pale-green surfaces.

This vocabulary covers the web workspace and Chrome side panel. The extension
compresses it into a single column with a chartreuse repository card, pink
sample strip and cool-blue evidence list. Its preview embeds the actual built
extension rather than a separate mock interface.

**Key Characteristics:**

- Five unequal introductory panels, followed by a functional white workspace.
- Plus Jakarta Sans, heavy compact headings and small calm supporting text.
- Soft tonal depth, rounded containers and pill controls.
- Inline SVG geometry, explicit illustrative-sample labels and visible evidence.

## Colors

The palette puts dark readable type on light pastel surfaces. Frontmatter
records reusable colors; multi-stop surface gradients remain in the source CSS.

### Primary

- **Chartreuse / Lime:** the central transformation surface, sample disclosures
  and pale action variant.
- **Deep Green:** primary actions, focus outlines and selected emphasis.

### Secondary

- **Blush Pink:** sample notification panel and the extension sample strip.
- **Cool Blue:** source/tools module, inspection band and extension evidence.

### Tertiary

- **Warm Peach:** the process module and warm notice backgrounds.

### Neutral

- **Canvas / White:** surrounding page and functional containers.
- **Text / Muted:** primary copy and supporting explanations.
- **Line:** quiet dividers and restrained container boundaries.

**The Light Surface Rule.** Keep this light canvas and pastel vocabulary; do not
restore the replaced violet glow or giant dark hero.

## Typography

Plus Jakarta Sans is bundled locally as a variable WOFF2 (weights 400–800), with
its OFL license. The same family serves display, body and controls. Source paths
use the system monospace stack and wrap instead of forcing horizontal overflow.

The central heading uses the display role; workspace titles use the title role.
The extension reduces its repository heading to 21px and section headings to
15px, while preserving weight 800 and tight tracking. Web supporting copy is
typically 12–13px; the denser extension uses 9–11px metadata and 11px story copy.
The extension-preview page uses a larger heading, scaling to 56px on desktop.

## Layout

Web containers cap at 1374px with 32px outer gutters. The introduction is a
three-column, three-row grid with proportions 339:627:388 and 149:343:156;
its inspection bar spans the lower two columns. Gaps are approximately 10px.
The workspace follows with 36px separation and 30px internal padding.

At 1050px the mosaic becomes two columns and story text becomes two columns.
At 700px it becomes one column in this order: transformation, inspection,
sample notification, source/tools, process. Gutters become 14px, the workspace
uses 22px by 18px padding, fields and story panels stack, and evidence rows wrap.
The preview page changes from copy beside a 410px device to a stacked layout.

The extension is a single column with a 300px minimum width, roughly 19px content
insets, scrolling file/evidence content and a fixed footer. Compact mode reduces
vertical padding. Keep this narrow form rather than copying the web mosaic.

## Elevation & Depth

Pastel gradients and white edges supply most depth. Mosaic containers have a
faint ambient shadow; the splayed windows receive stronger soft shadows, while
the sample toast has a small offset layer beneath it. Functional workspace
sections mostly use borders and tonal insets. The sidecar records exact shadows.

Mosaic panels settle in with staggered opacity, translation, scale and clipping;
the extension repository card enters with opacity and a short translation.
Both surfaces disable animation and transitions for reduced-motion users.

## Shapes

Large web panels and the workspace use the panel radius. Fields and inset
surfaces use smaller rounded corners; buttons, state chips and section controls
use pills. The extension repository card uses 18px corners. White borders frame
the illustrative windows, which are rotated in opposing directions. These
decorative compositions are hidden from assistive technology.

## Components

- **Buttons:** green primary, pale chartreuse generation/replay variant on the
  web, white bordered secondary and quiet text actions. Web buttons have a 42px
  minimum height; extension actions fill the width with a 44px minimum. Hover
  changes fill; disabled actions reduce opacity. Focus remains visibly outlined.
- **Inputs:** the introduction uses a white pill containing a repository field
  and Inspect button. Its entire form gains a focus outline. Credential fields
  are labeled white rectangles; keep their keyboard focus treatment.
- **Navigation:** a compact brand header with text links on the web. Explain,
  Story and Evidence use a pill section switch in the extension, with a white
  active segment and `aria-pressed` reflecting selection.
- **Chips:** soft pills convey sample, privacy, confidence and counts. Their
  wording carries the state; color is supplementary.
- **Containers:** use white for the working area and tonal insets for notices,
  optional artwork controls, files and evidence. Evidence paths remain monospace.
- **Story:** the comic image is followed by four numbered text panels and an
  evidence disclosure on the web. The extension stacks image, four sections and
  actions, with Evidence available as its own section.
- **Signature illustration:** two splayed app windows show source turning into
  a four-panel comic. It is procedural SVG/CSS geometry, not external imagery.

## Do's and Don'ts

### Do:

- **Do** retain Plus Jakarta Sans and the light gray/pastel surface hierarchy.
- **Do** preserve readable supporting text, keyboard outlines and explicit selection states.
- **Do** label bundled sample source, panels and evidence as illustrative.
- **Do** adapt the shared vocabulary to the extension's narrow single column.
- **Do** keep provenance with shipping raster assets; bundled PNG icons have procedural source.

### Don't:

- **Don't** introduce violet glows, a giant dark hero or replacement typography.
- **Don't** present decorative process bars as measured performance or savings.
- **Don't** imply the bundled sample is a live repository scan or paid generation.
- **Don't** replace the actual extension preview with a disconnected mockup.
