'use client'

import React, { useState, useMemo } from 'react'
import { motion } from 'motion/react'

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
  gmail: { agent: 'email-triage', emoji: '\u{1F4E7}', title: 'Email Triage', description: 'Automatically prioritize emails and flag urgent items' },
  outlook: { agent: 'email-triage', emoji: '\u{1F4E7}', title: 'Email Triage', description: 'Automatically prioritize emails and flag urgent items' },
  stripe: { agent: 'invoice-flow', emoji: '\u{1F4B3}', title: 'Invoice Flow', description: 'Automate invoicing and payment reminders' },
  whatsapp: { agent: 'client-comms', emoji: '\u{1F4AC}', title: 'Client Comms', description: 'Manage client conversations across channels' },
  calendar: { agent: 'schedule-manager', emoji: '\u{1F4C5}', title: 'Schedule Manager', description: 'Auto-schedule meetings and send updates' },
}

// Default recommendations for all users
const DEFAULT_AGENTS: AgentRecommendation[] = [
  { id: 'lead-swarm', title: 'Lead Swarm', emoji: '\u{1F3AF}', description: 'Automatically identify and prioritize new leads', recommended: true },
  { id: 'client-comms', title: 'Client Comms', emoji: '\u{1F4AC}', description: 'Manage conversations across all your channels', recommended: false },
  { id: 'invoice-flow', title: 'Invoice Flow', emoji: '\u{1F4B3}', description: 'Automate billing and payment management', recommended: false },
  { id: 'email-triage', title: 'Email Triage', emoji: '\u{1F4E7}', description: 'Automatically prioritize and route emails', recommended: false },
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
    <div className="grid gap-4">
      {/* Header */}
      <div className="mb-2">
        <h3 className="text-sm font-medium text-foreground uppercase tracking-wide opacity-80">
          Activate agents
        </h3>
      </div>

      {/* Agents Grid */}
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        {agents.map((agent, index) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            onClick={() => handleToggle(agent.id)}
            className={`relative p-4 rounded-2xl bg-card border cursor-pointer transition-all duration-200 hover:bg-muted/80 ${
              agent.selected
                ? 'border-ring shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_rgba(255,255,255,0.05)]'
                : 'border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
            }`}
          >
            {/* Recommended Badge */}
            {agent.recommended && (
              <div className="absolute top-3 right-3 text-sm font-medium uppercase tracking-wider px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400">
                For you
              </div>
            )}

            {/* Toggle Switch */}
            <div className="absolute top-3 left-3 w-6 h-6 flex items-center justify-center">
              <input
                type="checkbox"
                checked={agent.selected}
                onChange={() => handleToggle(agent.id)}
                className="w-[18px] h-[18px] cursor-pointer accent-foreground"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Content */}
            <div className="mt-8 pt-3">
              {/* Emoji */}
              <div className="text-base mb-3 leading-none">
                {agent.emoji}
              </div>

              {/* Title */}
              <h4 className={`mb-2 text-sm font-medium transition-colors ${
                agent.selected ? 'text-foreground' : 'text-foreground'
              }`}>
                {agent.title}
              </h4>

              {/* Description */}
              <p className="text-sm leading-relaxed text-muted-foreground">
                {agent.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Info Text */}
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        You can enable, disable, or customize agents anytime from Settings. We recommend starting with the highlighted agents for your setup.
      </p>
    </div>
  )
}
