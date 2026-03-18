'use client'

import { useState } from 'react'
import { SwarmList } from './swarm-list'
import { SwarmDetail } from './swarm-detail'

export function SwarmDashboard() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  if (selectedRunId) {
    return (
      <SwarmDetail
        runId={selectedRunId}
        onBack={() => setSelectedRunId(null)}
      />
    )
  }

  return <SwarmList onSelectRun={setSelectedRunId} />
}
