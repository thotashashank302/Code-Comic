import type { ComicAnalysis } from '@comic-code/contracts'
import {
  comicDimensions,
  comicPanelHeight,
  comicPanelWidth,
} from '@comic-code/contracts/comic-layout'

export function panelPrompts(analysis: ComicAnalysis) {
  return analysis.panels.map((panel) => ({
    sequence: panel.sequence,
    title: panel.title,
    prompt: [
      `Create ONE illustration for panel ${panel.sequence} of ${analysis.panels.length}: ${panel.title}.`,
      `Story context: ${analysis.plainLanguageSummary}`,
      `Consistent visual metaphor: ${analysis.metaphor}`,
      `Style: ${analysis.sharedVisualStyle}`,
      `Scene: ${panel.scenePrompt}`,
      `Illustrate this idea without writing it in the image: ${panel.caption}`,
      'Use the same characters, setting and palette across all panels. Landscape illustration, with space for captions added separately.',
      'No text, letters, numbers, code, labels, speech bubbles, logos or watermarks. Return one image, not a comic grid.',
    ].join('\n\n'),
  }))
}

export function validateArtworkFile(file: Pick<File, 'type' | 'size'>) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choose PNG, JPEG or WebP artwork.')
  }
  if (file.size === 0 || file.size > 8 * 1024 * 1024) {
    throw new Error('Each image must be non-empty and at most 8 MB.')
  }
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('PNG export failed. Please try again.')),
      'image/png',
    ),
  )
}

function linesFor(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
) {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word
    if (current && context.measureText(next).width > width) {
      lines.push(current)
      current = word
    } else current = next
  }
  if (current) lines.push(current)
  return lines
}

export async function composeUploadedArtwork(
  analysis: ComicAnalysis,
  files: File[],
) {
  const { width, height } = comicDimensions(analysis.panels.length)
  if (files.length !== analysis.panels.length)
    throw new Error(`Choose all ${analysis.panels.length} panel images first.`)
  files.forEach(validateArtworkFile)
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('Your browser could not prepare the PNG preview.')
  context.fillStyle = '#f8faf3'
  context.fillRect(0, 0, width, height)
  for (const [index, panel] of analysis.panels.entries()) {
    const bitmap = await createImageBitmap(files[index]!)
    try {
      if (bitmap.width * bitmap.height > 40_000_000)
        throw new Error(
          `Panel ${panel.sequence} exceeds the 40-megapixel limit.`,
        )
      const x = (index % 2) * comicPanelWidth
      const y = Math.floor(index / 2) * comicPanelHeight
      const scale = Math.max(744 / bitmap.width, 354 / bitmap.height)
      const sw = 744 / scale
      const sh = 354 / scale
      context.drawImage(
        bitmap,
        (bitmap.width - sw) / 2,
        (bitmap.height - sh) / 2,
        sw,
        sh,
        x + 28,
        y + 72,
        744,
        354,
      )
      context.strokeStyle = '#d6dfcc'
      context.lineWidth = 3
      context.beginPath()
      context.roundRect(x + 14, y + 14, 772, 557, 22)
      context.stroke()
      context.fillStyle = '#d3e3ad'
      context.beginPath()
      context.arc(x + 45, y + 44, 19, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#19251c'
      context.font = '700 20px "Plus Jakarta Sans", sans-serif'
      context.textAlign = 'center'
      context.fillText(String(panel.sequence), x + 45, y + 51)
      context.textAlign = 'left'
      context.font = '700 25px "Plus Jakarta Sans", sans-serif'
      context.fillText(panel.title, x + 76, y + 49, 690)
      let fontSize = 18
      let lines: string[] = []
      do {
        context.font = `500 ${fontSize}px "Plus Jakarta Sans", sans-serif`
        lines = linesFor(context, panel.caption, 744)
      } while (lines.length > 4 && --fontSize >= 14)
      context.fillStyle = '#28382a'
      lines
        .slice(0, 4)
        .forEach((line, offset) =>
          context.fillText(line, x + 28, y + 449 + offset * 24, 744),
        )
      if (panel.uncertaintyNote) {
        context.font = '12px "Plus Jakarta Sans", sans-serif'
        context.fillStyle = '#64715d'
        linesFor(context, panel.uncertaintyNote, 744)
          .slice(0, 2)
          .forEach((line, offset) =>
            context.fillText(line, x + 28, y + 547 + offset * 15, 744),
          )
      }
    } finally {
      bitmap.close()
    }
  }
  context.fillStyle = '#dce7c7'
  context.fillRect(0, height - 30, width, 30)
  context.fillStyle = '#19251c'
  context.font = '14px "Plus Jakarta Sans", sans-serif'
  context.fillText(
    'Comic Code | User-supplied artwork. Captions and evidence unchanged. Verify important details.',
    20,
    height - 10,
  )
  return canvasBlob(canvas)
}

export async function sampleArtworkFiles(panelCount: number) {
  comicDimensions(panelCount)
  const files: File[] = []
  const colors = ['#e9efcc', '#f5dfe8', '#dce9ee', '#f6e8d6']
  for (let index = 0; index < panelCount; index++) {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 360
    const context = canvas.getContext('2d')!
    context.fillStyle = colors[index % colors.length]!
    context.fillRect(0, 0, 640, 360)
    context.fillStyle = '#fff'
    context.fillRect(60 + index * 5, 60, 290, 220)
    context.fillStyle = '#365e36'
    context.fillRect(90 + index * 5, 90, 180, 18)
    context.font = '700 25px sans-serif'
    context.fillText(`SAMPLE ${String(index + 1).padStart(2, '0')}`, 90, 210)
    const blob = await canvasBlob(canvas)
    files.push(
      new File([blob], `panel-${String(index + 1).padStart(2, '0')}.png`, {
        type: 'image/png',
      }),
    )
  }
  return files
}
