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
    <header className="border-b border-gray-200 bg-white px-6">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={orgName}
              className="h-9 w-auto object-contain"
            />
          ) : (
            <div
              className="flex size-9 items-center justify-center rounded-lg text-base font-medium text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {orgName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-base font-medium leading-tight text-gray-900">
              {orgName}
            </div>
            {tagline && (
              <div className="text-sm leading-tight text-gray-400">
                {tagline}
              </div>
            )}
          </div>
        </div>

        {/* User info */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium text-gray-700">{contactName}</div>
            <div className="text-sm text-gray-400">Client Portal</div>
          </div>
          <div
            className="flex size-9 items-center justify-center rounded-full text-sm font-medium"
            style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
          >
            {contactName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  )
}
