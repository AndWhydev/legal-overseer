'use client'

import { useState, useEffect } from 'react'
import { IntegrationCard } from './integration-card'
import {
  AVAILABLE_INTEGRATIONS,
  CATEGORY_LABELS,
  type IntegrationCategory,
  type Integration,
} from '@/lib/integrations/types'

interface OrgIntegration {
  id: string
  provider: string
  status: string
  connected_at: string | null
  metadata: Record<string, unknown>
}

export function IntegrationGrid() {
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | 'all'>('all')
  const [orgIntegrations, setOrgIntegrations] = useState<OrgIntegration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch integrations on mount
  useEffect(() => {
    fetchIntegrations()
  }, [])

  const fetchIntegrations = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/settings/integrations')
      if (!response.ok) {
        throw new Error('Failed to fetch integrations')
      }
      const data = (await response.json()) as { integrations: OrgIntegration[] }
      setOrgIntegrations(data.integrations)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error fetching integrations:', err)
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const isIntegrationConnected = (providerId: string): boolean => {
    return orgIntegrations.some(
      (int) => int.provider === providerId && int.status === 'connected'
    )
  }

  const mergedIntegrations = AVAILABLE_INTEGRATIONS.map((integration) => ({
    ...integration,
    status: isIntegrationConnected(integration.id)
      ? ('connected' as const)
      : integration.status,
  }))

  const categories = Object.keys(CATEGORY_LABELS) as (IntegrationCategory | 'all')[]

  const filteredIntegrations =
    activeCategory === 'all'
      ? mergedIntegrations
      : mergedIntegrations.filter((i) => i.category === activeCategory)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Integration Hub</h2>
        <p className="text-sm text-muted-foreground">
          Connect your tools to let BitBit work across your stack.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
          Unable to load integrations: {error}
        </div>
      )}

      <div className="flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading integrations...</div>
        ) : (
          filteredIntegrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              isConnected={isIntegrationConnected(integration.id)}
              onStatusChange={fetchIntegrations}
            />
          ))
        )}
      </div>
    </div>
  )
}
