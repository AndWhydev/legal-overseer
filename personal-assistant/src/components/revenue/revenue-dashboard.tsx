'use client'

import React, { useState } from 'react'
import { RevenueRadar } from './revenue-radar'
import { ScenarioPlannerUI } from './scenario-planner-ui'

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  maxWidth: 900,
  width: '100%',
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '4px',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-card)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  width: 'fit-content',
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  borderRadius: 'var(--radius-md)',
  fontSize: 14,
  fontWeight: 500,
  color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
  background: active ? 'var(--bb-orange)' : 'transparent',
  border: 'none',
  cursor: 'pointer',
  transition: 'all var(--duration-fast) var(--ease-default)',
  fontFamily: 'var(--font-sans)',
  letterSpacing: '0.01em',
})

// ─── Component ──────────────────────────────────────────────────────────────

type Tab = 'radar' | 'scenarios'

export function RevenueDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('radar')

  return (
    <div style={containerStyle}>
      {/* Tab Bar */}
      <div style={tabBarStyle}>
        <button
          style={tabStyle(activeTab === 'radar')}
          onClick={() => setActiveTab('radar')}
        >
          Revenue Radar
        </button>
        <button
          style={tabStyle(activeTab === 'scenarios')}
          onClick={() => setActiveTab('scenarios')}
        >
          Scenario Planner
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'radar' && <RevenueRadar />}
      {activeTab === 'scenarios' && <ScenarioPlannerUI />}
    </div>
  )
}
