import { Suspense } from 'react'
import { ConnectionsGrid } from '@/components/connections/connections-grid'

export default function ConnectionsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Suspense fallback={<div className="py-12 text-center text-sm" style={{ color: 'var(--text-tertiary, #9b8a7d)' }}>Loading connections...</div>}>
        <ConnectionsGrid />
      </Suspense>
    </div>
  )
}
