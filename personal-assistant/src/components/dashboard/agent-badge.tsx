interface AgentBadgeProps {
  agent: string
  status?: 'working' | 'done' | 'error'
}

export function AgentBadge({ agent, status = 'working' }: AgentBadgeProps) {
  return (
    <>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          borderRadius: 99,
          padding: '4px 8px',
          fontSize: 14,
          fontWeight: 500,
          background: 'var(--border-subtle)',
          color: status === 'error' ? 'var(--text-secondary)' : 'var(--text-dim)',
        }}
      >
        {status === 'working' && (
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: 'var(--text-dim)',
              animation: 'bb-agent-pulse 2s ease-in-out infinite',
            }}
          />
        )}
        {agent}
      </span>
      <style>{`
        @keyframes bb-agent-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </>
  )
}
