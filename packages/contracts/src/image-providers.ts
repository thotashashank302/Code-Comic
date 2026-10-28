export const openaiImageModels = [
  'gpt-image-2',
  'gpt-image-1.5',
  'gpt-image-1-mini',
] as const

export const geminiImageModels = [
  'gemini-nano-banana-2.1',
  'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image',
] as const

export const imageProviders = {
  openai: {
    label: 'OpenAI',
    models: openaiImageModels,
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    label: 'Google Gemini',
    models: geminiImageModels,
    keyUrl: 'https://aistudio.google.com/apikey',
  },
} as const

export type ImageProvider = keyof typeof imageProviders

export function hasByokArtwork(provider?: string) {
  return (
    provider === 'openai_byok' ||
    provider === 'gemini_byok' ||
    provider === 'cloudflare_byok'
  )
}
