/**
 * Session Boundary Detection
 * Detects when a conversation has crossed a session boundary (time gap or device change)
 */

interface SessionBoundaryResult {
  isBoundary: boolean
  label: string
  reason?: string
}

/**
 * Detects if a session boundary has occurred based on time gap and device changes
 * Rules:
 * - >30 minutes since last message = new session
 * - Different device (user-agent family change) = new session
 * - Otherwise = continuation of same session
 */
export function detectSessionBoundary(
  lastMessageAt: Date | null,
  currentTime: Date,
  lastUserAgent?: string,
  currentUserAgent?: string,
): SessionBoundaryResult {
  // No previous message = definitely a boundary (first message)
  if (!lastMessageAt) {
    return {
      isBoundary: true,
      label: 'Session started',
      reason: 'First message in thread',
    }
  }

  // Calculate time gap
  const timeGapMs = currentTime.getTime() - lastMessageAt.getTime()
  const timeGapMinutes = timeGapMs / (1000 * 60)

  // Check for time-based boundary (>30 minutes)
  if (timeGapMinutes > 30) {
    const hours = Math.round(timeGapMinutes / 60)
    const label =
      hours >= 24
        ? `Resumed after ${Math.floor(hours / 24)} day${Math.floor(hours / 24) > 1 ? 's' : ''}`
        : `Resumed after ${hours} hour${hours > 1 ? 's' : ''}`

    return {
      isBoundary: true,
      label,
      reason: 'Time gap exceeded 30 minutes',
    }
  }

  // Check for device-based boundary (user-agent family change)
  if (lastUserAgent && currentUserAgent && lastUserAgent !== currentUserAgent) {
    const deviceChangeLabel = detectDeviceChange(lastUserAgent, currentUserAgent)
    if (deviceChangeLabel) {
      return {
        isBoundary: true,
        label: deviceChangeLabel,
        reason: 'Device changed',
      }
    }
  }

  // No boundary detected
  return {
    isBoundary: false,
    label: 'Same session',
  }
}

/**
 * Detects if user-agent indicates a device family change (mobile ↔ desktop)
 */
function detectDeviceChange(lastUA: string, currentUA: string): string | null {
  const isMobile = (ua: string) =>
    /mobile|android|iphone|ipad|phone/i.test(ua)
  const isDesktop = (ua: string) =>
    /windows|macintosh|linux|x11/i.test(ua)

  const lastIsMobile = isMobile(lastUA)
  const currentIsMobile = isMobile(currentUA)

  // Desktop → Mobile
  if (!lastIsMobile && currentIsMobile) {
    return 'Continued from mobile'
  }

  // Mobile → Desktop
  if (lastIsMobile && !currentIsMobile) {
    return 'Continued from desktop'
  }

  // Different browsers on same device family
  const lastBrowser = extractBrowser(lastUA)
  const currentBrowser = extractBrowser(currentUA)

  if (lastBrowser && currentBrowser && lastBrowser !== currentBrowser) {
    return `Continued from ${currentBrowser}`
  }

  return null
}

/**
 * Extracts browser name from user-agent string
 */
function extractBrowser(ua: string): string | null {
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return 'Chrome'
  if (/edg/i.test(ua)) return 'Edge'
  if (/firefox/i.test(ua)) return 'Firefox'
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari'
  if (/mobile\s+safari/i.test(ua)) return 'Mobile Safari'
  return null
}
