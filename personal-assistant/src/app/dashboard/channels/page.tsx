import { redirect } from 'next/navigation'

export default function LegacyChannelsPage() {
  redirect('/dashboard/connections')
}
