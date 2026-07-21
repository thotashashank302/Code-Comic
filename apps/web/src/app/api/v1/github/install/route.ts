import { getServerEnv } from '@/lib/env'

export function GET() {
  const slug = encodeURIComponent(getServerEnv().GITHUB_APP_SLUG)
  return Response.redirect(`https://github.com/apps/${slug}/installations/new`)
}
