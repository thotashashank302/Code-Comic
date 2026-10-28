import {
  composeComic,
  createStoryboardFallbackArtwork,
} from '@comic-code/comic'
import { sampleAnalysis } from '@comic-code/comic/sample'

export const dynamic = 'force-static'

export async function GET() {
  const artwork = await createStoryboardFallbackArtwork(sampleAnalysis)
  const png = await composeComic(sampleAnalysis, artwork)
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
