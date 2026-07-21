export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { default: sharp } = await import('sharp')
    if (!sharp.versions.vips) throw new Error('libvips version unavailable')
  } catch (error) {
    console.error('Image runtime health check failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage:
        error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    })
    return Response.json(
      {
        ok: false,
        service: 'comic-code-web',
        imageRuntime: false,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return Response.json(
    {
      ok: true,
      service: 'comic-code-web',
      imageRuntime: true,
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
