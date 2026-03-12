'use client'

import { useState, useEffect, useRef } from 'react'
import { resolveAvatarSync, resolveAvatar } from '@/lib/avatar/resolver'

interface MessageAvatarProps {
  senderEmail: string | null
  senderName: string | null
  contactAvatarUrl?: string | null
  channelType?: string
  size?: number // default 36
}

// Channel brand colors and icons
const CHANNEL_CONFIG: Record<string, { icon: string; color: string }> = {
  email: { icon: 'EM', color: '#EA4335' },
  gmail: { icon: 'GM', color: '#EA4335' },
  outlook: { icon: 'OL', color: '#0078D4' },
  whatsapp: { icon: 'WA', color: '#25D366' },
  slack: { icon: 'SL', color: '#4A154B' },
  sms: { icon: 'SM', color: '#6366f1' },
  calendar: { icon: 'CA', color: '#4285F4' },
}

const DEFAULT_CHANNEL = { icon: '?', color: '#6B7280' }

export default function MessageAvatar({
  senderEmail,
  senderName,
  contactAvatarUrl,
  channelType,
  size = 36,
}: MessageAvatarProps) {
  const [avatar, setAvatar] = useState(() =>
    resolveAvatarSync(senderName, senderEmail)
  )
  const resolveRef = useRef<boolean>(false)

  useEffect(() => {
    // Prevent multiple resolves
    if (resolveRef.current) return
    resolveRef.current = true

    // Async resolve to upgrade from initials to gravatar/clearbit
    resolveAvatar(senderEmail, senderName, contactAvatarUrl ?? null).then(
      (result) => {
        setAvatar(result)
      }
    )
  }, [senderEmail, senderName, contactAvatarUrl])

  const channel =
    CHANNEL_CONFIG[channelType?.toLowerCase() || ''] || DEFAULT_CHANNEL
  const badgeSize = 16
  const badgeFontSize = badgeSize * 0.5

  // Main avatar container
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: size,
    height: size,
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'inline-block',
    border: `2px solid var(--glass-card-bg, #ffffff)`,
    flexShrink: 0,
  }

  // Avatar content (image or initials)
  const contentStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: avatar.color,
  }

  // Image style
  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  }

  // Initials text style
  const initialsStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: size * 0.4,
    fontWeight: 600,
    fontFamily:
      'system-ui, -apple-system, sans-serif',
  }

  // Channel badge container
  const badgeContainerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: badgeSize,
    height: badgeSize,
    borderRadius: '50%',
    backgroundColor: channel.color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `2px solid var(--glass-card-bg, #ffffff)`,
    boxSizing: 'border-box',
  }

  // Badge icon text
  const badgeIconStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: badgeFontSize,
    fontWeight: 600,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    lineHeight: 1,
  }

  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        {avatar.url ? (
          <img src={avatar.url} alt={senderName || 'Avatar'} style={imageStyle} />
        ) : (
          <span style={initialsStyle}>{avatar.initials}</span>
        )}
      </div>

      {/* Channel badge overlay */}
      <div style={badgeContainerStyle}>
        <span style={badgeIconStyle}>{channel.icon}</span>
      </div>
    </div>
  )
}
