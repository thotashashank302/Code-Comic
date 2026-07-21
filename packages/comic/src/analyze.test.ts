import { zodTextFormat } from 'openai/helpers/zod'
import { describe, expect, it } from 'vitest'

import { comicAnalysisOutputSchema } from './analyze'

describe('comic analysis structured output schema', () => {
  it('uses a homogeneous four-item panel array accepted by OpenAI', () => {
    const format = zodTextFormat(
      comicAnalysisOutputSchema,
      'comic_analysis',
    ) as unknown as {
      schema: {
        properties: {
          panels: { items: unknown; minItems: number; maxItems: number }
        }
      }
    }
    const panels = format.schema.properties.panels

    expect(Array.isArray(panels.items)).toBe(false)
    expect(panels.minItems).toBe(4)
    expect(panels.maxItems).toBe(4)
  })
})
