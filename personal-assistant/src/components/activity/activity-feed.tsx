'use client'

import { useState } from 'react'
import { ActivityItem } from './activity-item'
import type { ActivityEntry } from '@/lib/types'
import { useRealtime } from '@/hooks/use-realtime'

const filterTabs = ['All', 'Email', 'Messages', 'Calendar', 'System'] as const
type FilterTab = (typeof filterTabs)[number]

const tabToTypes: Record<FilterTab, string[] | null> = {
  All: null,
  Email: ['email'],
  Messages: ['imessage', 'message'],
  Calendar: ['calendar', 'reminders'],
  System: ['system', 'agent', 'task'],
}

function groupByDate(items: ActivityEntry[]): { label: string; entries: ActivityEntry[] }[] {
  const groups = new Map<string, ActivityEntry[]>()

  for (const item of items) {
    const date = new Date(item.created_at)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    let label: string
    if (diffDays === 0) {
      label = 'Today'
    } else if (diffDays === 1) {
      label = 'Yesterday'
    } else if (diffDays < 7) {
      label = date.toLocaleDateString([], { weekday: 'long' })
    } else {
      label = date.toLocaleDateString([], { month: 'long', day: 'numeric' })
    }

    const existing = groups.get(label) || []
    existing.push(item)
    groups.set(label, existing)
  }

  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }))
}

export function ActivityFeed({ activities }: { activities: ActivityEntry[] }) {
  const [items, setItems] = useState(activities)
  const [activeTab, setActiveTab] = useState<FilterTab>('All')

  useRealtime({
    table: 'activity_log',
    event: 'INSERT',
    onChange: (payload) => {
      const entry = payload.new as ActivityEntry
      setItems((prev) =>
        prev.some((a) => a.id === entry.id) ? prev : [entry, ...prev]
      )
    },
  })

  const types = tabToTypes[activeTab]
  const filtered = types
    ? items.filter(a => types.includes(a.action_type))
    : items

  const grouped = groupByDate(filtered)

  return (
    <>
      <div className="flex gap-1">
        {filterTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {grouped.map(group => (
          <div key={group.label}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h3>
            <div className="flex flex-col gap-1">
              {group.entries.map(activity => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {items.length === 0
              ? 'No activity yet. Sync your channels to see events here.'
              : 'No activity in this category.'}
          </p>
        )}
      </div>
    </>
  )
}
