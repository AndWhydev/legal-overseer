interface AgentBadgeProps {
  agent: string
  status?: 'working' | 'done' | 'error'
}

export function AgentBadge({ agent, status = 'working' }: AgentBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        borderRadius: 99,
        padding: '2px 8px',
        fontSize: 10,
        fontWeight: 500,
        background: 'rgba(255, 255, 255, 0.05)',
        color: status === 'error' ? '#94A3B8' : '#64748B',
      }}
    >
      {status === 'working' && (
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: '#64748B',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        />
      )}
      {agent}
    </span>
  )
}
