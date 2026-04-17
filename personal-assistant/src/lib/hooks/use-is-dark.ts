'use client'

import { useEffect, useState } from 'react'

/**
 * Track whether the document is in dark mode — reacts to both the
 * `.dark`/`.light` class on `<html>` (set by the layout inline script from
 * `bb-theme` in localStorage) and the OS `prefers-color-scheme` media query.
 * Explicit theme class always wins; OS preference is only consulted when
 * neither `.dark` nor `.light` is present (e.g. before hydration).
 * Defaults to true so SSR markup matches our preferred dark paint.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const check = () => {
      const cl = document.documentElement.classList
      if (cl.contains('dark')) { setIsDark(true); return }
      if (cl.contains('light')) { setIsDark(false); return }
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    check()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', check)
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      mq.removeEventListener('change', check)
      obs.disconnect()
    }
  }, [])

  return isDark
}
