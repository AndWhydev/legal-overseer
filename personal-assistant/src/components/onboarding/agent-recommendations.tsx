'use client'

import React, { useState, useMemo } from 'react'
import { motion } from 'motion/react'
import { S, C } from '@/lib/styles/design-tokens'

interface AgentRecommendation {
  id: string
  title: string
  emoji: string
  description: string
  recommended: boolean
}

interface AgentRecommendationsProps {
  connectedChannelIds: string[]
  onAgentsSelected?: (agentIds: string[]) => void
}

export interface ChannelAgentMapping {
  agent: string
  emoji: string
  title: string
  description: string
}

// Map channels to recommended agents
export const CHANNEL_AGENT_MAPPING: Record<string, ChannelAgentMapping> = {
  gmail: { agent: 'email-triage', emoji: '📧', title: 'Email Triage', description: 'Automatically prioritize emails and flag urgent items' },
  outlook: { agent: 'email-triage', emoji: '📧', title: 'Email Triage', description: 'Automatically prioritize emails and flag urgent items' },
  stripe: { agent: 'invoice-flow', emoji: '💳', title: 'Invoice Flow', description: 'Automate invoicing and payment reminders' },
  whatsapp: { agent: 'client-comms', emoji: '💬', title: 'Client Comms', description: 'Manage client conversations across channels' },
  calendar: { agent: 'schedule-manager', emoji: '📅', title: 'Schedule Manager', description: 'Auto-schedule meetings and send updates' },
}

// Default recommendations for all users
const DEFAULT_AGENTS: AgentRecommendation[] = [
  { id: 'lead-swarm', title: 'Lead Swarm', emoji: '🎯', description: 'Automatically identify and prioritize new leads', recommended: true },
  { id: 'client-comms', title: 'Client Comms', emoji: '💬', description: 'Manage conversations across all your channels', recommended: false },
  { id: 'invoice-flow', title: 'Invoice Flow', emoji: '💳', description: 'Automate billing and payment management', recommended: false },
  { id: 'email-triage', title: 'Email Triage', emoji: '📧', description: 'Automatically prioritize and route emails', recommended: false },
]

export function canRecommendAgent(channel: string): ChannelAgentMapping | null {
  return CHANNEL_AGENT_MAPPING[channel.toLowerCase()] || null
}

export function useAgentRecommendations(connectedChannelIds: string[]) {
  const recommendedAgentIds = useMemo(() => {
    const agents = new Set<string>()
    agents.add('lead-swarm') // Always recommend Lead Swarm

    connectedChannelIds.forEach((channelId) => {
      const mapping = canRecommendAgent(channelId)
      if (mapping) {
        agents.add(mapping.agent)
      }
    })

    return Array.from(agents)
  }, [connectedChannelIds])

  return {
    recommendedAgentIds,
  }
}

export function AgentRecommendations({
  connectedChannelIds,
  onAgentsSelected,
}: AgentRecommendationsProps) {
  const { recommendedAgentIds } = useAgentRecommendations(connectedChannelIds)
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
    new Set(['lead-swarm', ...recommendedAgentIds])
  )

  const agents = useMemo(() => {
    return DEFAULT_AGENTS.map((agent) => ({
      ...agent,
      recommended: recommendedAgentIds.includes(agent.id),
      selected: selectedAgents.has(agent.id),
    }))
  }, [recommendedAgentIds, selectedAgents])

  const handleToggle = (agentId: string) => {
    const newSelected = new Set(selectedAgents)
    if (newSelected.has(agentId)) {
      newSelected.delete(agentId)
    } else {
      newSelected.add(agentId)
    }
    setSelectedAgents(newSelected)
    onAgentsSelected?.(Array.from(newSelected))
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <h3 style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--text-primary, #F1F5F9)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          opacity: 0.8,
        }}>
          Activate agents
        </h3>
      </div>

      {/* Agents Grid */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {agents.map((agent, index) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            onClick={() => handleToggle(agent.id)}
            style={{
              padding: 16,
              borderRadius: 16,
              background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
              backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
              WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
              border: agent.selected
                ? `1px solid ${C.borderFocus}`
                : `1px solid ${C.borderSubtle}`,
              boxShadow: agent.selected
                ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 20px rgba(255, 255, 255, 0.05)'
                : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLDivElement
              el.style.background = 'var(--bb-surface-hover, rgba(15, 20, 30, 0.75))'
              el.style.borderColor = agent.selected
                ? 'rgba(255, 255, 255, 0.25)'
                : C.bgHoverStrong
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLDivElement
              el.style.background = C.bgCard
              el.style.borderColor = agent.selected
                ? 'rgba(255, 255, 255, 0.15)'
                : C.bgHover
            }}
          >
            {/* Recommended Badge */}
            {agent.recommended && (
              <div style={{
                position: 'absolute',
                top: 12,
                right: 12,
                fontSize: 14,
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '4px 8px',
                borderRadius: 8,
                background: 'rgba(127, 178, 140, 0.15)',
                color: '#7fb28c',
              }}>
                For you
              </div>
            )}

            {/* Toggle Switch */}
            <div style={{
              position: 'absolute',
              top: 12,
              left: 12,
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <input
                type="checkbox"
                checked={agent.selected}
                onChange={() => handleToggle(agent.id)}
                style={{
                  width: 18,
                  height: 18,
                  cursor: 'pointer',
                  accentColor: '#F1F5F9',
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Content */}
            <div style={{ marginTop: 32, paddingTop: 12 }}>
              {/* Emoji */}
              <div style={{
                fontSize: 16,
                marginBottom: 12,
                lineHeight: 1,
              }}>
                {agent.emoji}
              </div>

              {/* Title */}
              <h4 style={{
                margin: '0 0 8px',
                fontSize: 14,
                fontWeight: 500,
                color: agent.selected ? '#F1F5F9' : 'var(--text-primary, #F1F5F9)',
                transition: 'color 0.2s',
              }}>
                {agent.title}
              </h4>

              {/* Description */}
              <p style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.5,
                color: 'var(--text-secondary, #94A3B8)',
              }}>
                {agent.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Info Text */}
      <p style={{
        margin: '8px 0 0',
        fontSize: 14,
        color: 'var(--text-dim, #475569)',
        lineHeight: 1.5,
      }}>
        You can enable, disable, or customize agents anytime from Settings. We recommend starting with the highlighted agents for your setup.
      </p>
    </div>
  )
}
