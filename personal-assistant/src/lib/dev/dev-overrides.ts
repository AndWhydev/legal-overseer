'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'bb-dev-overrides';
const EVENT_NAME = 'bb-dev-override-change';

export interface DevOverrides {
  plan?: string;
  ui_profile?: string;
  enabled_modules?: string[] | null;
  industry?: string;
  seed_data?: Record<string, boolean>;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Read dev overrides from localStorage. Returns null in production or SSR.
 */
export function getDevOverrides(): DevOverrides | null {
  if (process.env.NODE_ENV !== 'development') return null;
  if (!isBrowser()) return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DevOverrides;
  } catch {
    return null;
  }
}

/**
 * Set a single override key and notify listeners.
 */
export function setDevOverride<K extends keyof DevOverrides>(
  key: K,
  value: DevOverrides[K],
): void {
  if (!isBrowser()) return;
  const current = getDevOverrides() ?? {};
  current[key] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  window.dispatchEvent(new Event(EVENT_NAME));
}

/**
 * Clear all dev overrides and notify listeners.
 */
export function clearDevOverrides(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(EVENT_NAME));
}

/**
 * React hook that tracks dev override changes via the custom event.
 * Returns null in production / SSR.
 */
export function useDevOverrides(): DevOverrides | null {
  const [overrides, setOverrides] = useState<DevOverrides | null>(() => getDevOverrides());

  const refresh = useCallback(() => {
    setOverrides(getDevOverrides());
  }, []);

  useEffect(() => {
    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  return overrides;
}
