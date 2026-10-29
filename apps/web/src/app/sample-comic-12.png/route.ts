import {
  composeComic,
  createStoryboardFallbackArtwork,
} from '@comic-code/comic'
import { sampleDetailedAnalysis } from '@comic-code/comic/sample'

export const dynamic = 'force-static'

export async function GET() {
  const artwork = await createStoryboardFallbackArtwork(sampleDetailedAnalysis)
  const png = await composeComic(sampleDetailedAnalysis, artwork)
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
