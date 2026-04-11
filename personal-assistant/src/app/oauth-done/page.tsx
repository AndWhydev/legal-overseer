'use client'

import { useEffect } from 'react'

/**
 * Minimal page that tells the parent window OAuth succeeded,
 * then closes itself. Used as the redirect target for OAuth
 * callbacks when initiated from a popup (onboarding, connections grid).
 */
export default function OAuthDonePage() {
  useEffect(() => {
    // Signal the opener that OAuth completed
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'bitbit-oauth-done' }, window.location.origin)
      }
    } catch {
      // Cross-origin — opener will poll popup.closed instead
    }
    // Close the popup after a brief delay
    setTimeout(() => window.close(), 300)
  }, [])

  return (
    <div className="flex items-center justify-center min-h-dvh bg-background">
      <p className="text-sm text-muted-foreground">Connected. Closing...</p>
    </div>
  )
}
