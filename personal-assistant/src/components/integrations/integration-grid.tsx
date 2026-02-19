'use client'

import { useState } from 'react'
import { IntegrationCard } from './integration-card'
import {
  AVAILABLE_INTEGRATIONS,
  CATEGORY_LABELS,
  type IntegrationCategory,
} from '@/lib/integrations/types'

export function IntegrationGrid() {
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | 'all'>('all')

  const categories = Object.keys(CATEGORY_LABELS) as (IntegrationCategory | 'all')[]

  const filteredIntegrations =
    activeCategory === 'all'
      ? AVAILABLE_INTEGRATIONS
      : AVAILABLE_INTEGRATIONS.filter((i) => i.category === activeCategory)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium">Integration Hub</h2>
        <p className="text-sm text-muted-foreground">
          Connect your tools to let BitBit work across your stack.
        </p>
      </div>

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
        {filteredIntegrations.map((integration) => (
          <IntegrationCard key={integration.id} integration={integration} />
        ))}
      </div>
    </div>
  )
}
