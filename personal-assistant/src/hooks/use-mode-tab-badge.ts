/**
 * useModeTabBadge — keeps document.title and the favicon in sync with the
 * active dashboard mode.
 *
 * No-op when mode is undefined (flag-off path). Restores the original title
 * and favicon href on unmount so unmounting the dashboard doesn't leave a
 * stale `[Inbox]` prefix in a marketing tab.
 */

'use client'

import { useEffect, useRef } from 'react'
import type { Mode } from '@/lib/dashboard/mode-store'
import {
  buildModeFaviconDataURL,
  formatModeTitle,
  MODE_TITLE_LABELS,
} from '@/lib/dashboard/mode-tab-badge'

const FAVICON_LINK_ID = 'bb-mode-favicon'

// Built from MODE_TITLE_LABELS so adding a fifth mode only edits one place.
const TITLE_BADGE_PATTERN = new RegExp(
  `^\\[(?:${Object.values(MODE_TITLE_LABELS).join('|')})(?: · [^\\]]+)?\\]\\s+`,
)

/** Strip any existing `[Mode · n]` prefix so we don't compound badges across re-renders. */
function stripBadge(title: string): string {
  return title.replace(TITLE_BADGE_PATTERN, '')
}

export function useModeTabBadge(mode: Mode | undefined | null, unreadCount?: number) {
  // Captured once on first effect run. We don't refresh this — the dashboard
  // is a single document, so the page-level title doesn't change beneath us.
  const baseTitleRef = useRef<string | null>(null)

  useEffect(() => {
    if (baseTitleRef.current === null) {
      baseTitleRef.current = stripBadge(document.title)
    }
    const baseTitle = baseTitleRef.current

    if (!mode) {
      // Flag-off / mode-cleared path: ensure no stale badge remains and the
      // override favicon link is removed so the page's real favicons return.
      document.title = baseTitle
      document.getElementById(FAVICON_LINK_ID)?.remove()
      return
    }

    document.title = formatModeTitle(baseTitle, mode, unreadCount)

    let link = document.getElementById(FAVICON_LINK_ID) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = FAVICON_LINK_ID
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = buildModeFaviconDataURL(mode)

    return () => {
      document.title = baseTitle
      // Remove the override link entirely so the page's real <link rel=icon>
      // tags (loaded via Next.js metadata) are what the browser falls back to.
      document.getElementById(FAVICON_LINK_ID)?.remove()
    }
  }, [mode, unreadCount])
}
