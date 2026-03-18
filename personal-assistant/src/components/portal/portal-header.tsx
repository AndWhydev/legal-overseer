'use client'

interface PortalHeaderProps {
  orgName: string
  contactName: string
  logoUrl?: string
  primaryColor: string
  tagline?: string
}

export function PortalHeader({ orgName, contactName, logoUrl, primaryColor, tagline }: PortalHeaderProps) {
  return (
    <header style={{
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #e5e7eb',
      padding: '0 24px',
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: 64,
      }}>
        {/* Logo / Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={orgName}
              style={{ height: 36, width: 'auto', objectFit: 'contain' }}
            />
          ) : (
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              backgroundColor: primaryColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 16,
            }}>
              {orgName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e', lineHeight: 1.2 }}>
              {orgName}
            </div>
            {tagline && (
              <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.2 }}>
                {tagline}
              </div>
            )}
          </div>
        </div>

        {/* User info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>{contactName}</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Client Portal</div>
          </div>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: `${primaryColor}15`,
            color: primaryColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: 14,
          }}>
            {contactName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  )
}
