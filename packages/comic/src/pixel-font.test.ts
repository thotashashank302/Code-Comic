import { describe, expect, it } from 'vitest'

import { normalizePixelText, pixelTextSvg } from './pixel-font'

describe('portable pixel font', () => {
  it('renders text as vector paths without system fonts', () => {
    const svg = pixelTextSvg('Comic Code 42', {
      x: 0,
      y: 0,
      scale: 2,
      color: '#fff',
    })

    expect(svg).toContain('<path')
    expect(svg).not.toContain('<text')
    expect(svg).not.toContain('Comic Code')
  })

  it('normalizes punctuation and unsupported glyphs safely', () => {
    expect(normalizePixelText('API-free — café · ✓')).toBe(
      'API-FREE - CAFE | ?',
    )
  })
})
