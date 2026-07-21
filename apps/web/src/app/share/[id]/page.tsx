import { ShareView } from '@/components/share-view'

type SharePageProps = { params: Promise<{ id: string }> }

export default async function SharePage({ params }: SharePageProps) {
  const { id } = await params
  return <ShareView shareId={id} />
}
