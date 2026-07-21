import type { ComicAnalysis } from '@comic-code/contracts'
import sharp from 'sharp'

import type { GeneratedPanelArtwork } from './types'
import { normalizePixelText, pixelTextSvg } from './pixel-font'

const comicWidth = 1_600
const comicHeight = 1_200
const panelWidth = 800
const panelHeight = 585
const footerHeight = 30

function wrapText(value: string, maxCharacters: number) {
  const words = normalizePixelText(value).trim().split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxCharacters && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function textLinesSvg(
  lines: string[],
  input: {
    x: number
    startY: number
    lineHeight: number
    scale: number
    color: string
  },
) {
  return lines
    .slice(0, 4)
    .map((line, index) =>
      pixelTextSvg(line, {
        x: input.x,
        y: input.startY + index * input.lineHeight,
        scale: input.scale,
        color: input.color,
      }),
    )
    .join('')
}

async function composePanel(input: {
  artwork: Buffer
  title: string
  caption: string
  uncertainty: string | null
  sequence: number
}) {
  const image = await sharp(input.artwork)
    .resize(744, 354, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer()
  const captionLines = wrapText(input.caption, 52)
  const uncertaintyLines = input.uncertainty
    ? wrapText(input.uncertainty, 68)
    : []
  const overlay = Buffer.from(`
    <svg width="${panelWidth}" height="${panelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="14" width="772" height="557" rx="22" fill="none" stroke="#5459ff" stroke-width="3" />
      <rect x="18" y="426" width="764" height="141" rx="18" fill="#080814" fill-opacity="0.96" />
      <circle cx="45" cy="44" r="19" fill="#ffb53e" />
      ${pixelTextSvg(String(input.sequence), { x: 41, y: 36, scale: 2.4, color: '#171006' })}
      ${pixelTextSvg(input.title, { x: 76, y: 34, scale: 3, color: '#ffffff' })}
      ${textLinesSvg(captionLines, { x: 28, startY: 442, lineHeight: 25, scale: 2.15, color: '#f8f8ff' })}
      ${textLinesSvg(uncertaintyLines, { x: 28, startY: 535, lineHeight: 17, scale: 1.45, color: '#a6a7bf' })}
    </svg>
  `)

  return sharp({
    create: {
      width: panelWidth,
      height: panelHeight,
      channels: 4,
      background: '#05050d',
    },
  })
    .composite([
      { input: image, top: 72, left: 28 },
      { input: overlay, top: 0, left: 0 },
    ])
    .png()
    .toBuffer()
}

export async function composeComic(
  analysis: ComicAnalysis,
  artwork: GeneratedPanelArtwork[],
) {
  const artworkBySequence = new Map(
    artwork.map((panel) => [panel.sequence, panel.png]),
  )
  const panels = await Promise.all(
    analysis.panels.map((panel) => {
      const image = artworkBySequence.get(panel.sequence)
      if (!image) throw new Error(`Missing artwork for panel ${panel.sequence}`)
      return composePanel({
        artwork: image,
        title: panel.title,
        caption: panel.caption,
        uncertainty: panel.uncertaintyNote,
        sequence: panel.sequence,
      })
    }),
  )
  const footerText =
    analysis.artworkProvider === 'cloudflare_byok'
      ? 'Comic Code | User-funded code analysis and AI artwork.'
      : analysis.generationMode === 'deterministic_fallback'
        ? 'Comic Code | API-free source scan and fixed artwork.'
        : 'Comic Code | AI-generated explanation - verify important details with the PR author.'
  const footer = Buffer.from(`
    <svg width="${comicWidth}" height="${footerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#11116d" />
      ${pixelTextSvg(footerText, { x: 20, y: 8, scale: 1.45, color: '#ffffff' })}
    </svg>
  `)

  return sharp({
    create: {
      width: comicWidth,
      height: comicHeight,
      channels: 4,
      background: '#05050d',
    },
  })
    .composite([
      { input: panels[0]!, left: 0, top: 0 },
      { input: panels[1]!, left: panelWidth, top: 0 },
      { input: panels[2]!, left: 0, top: panelHeight },
      { input: panels[3]!, left: panelWidth, top: panelHeight },
      { input: footer, left: 0, top: comicHeight - footerHeight },
    ])
    .png()
    .toBuffer()
}
