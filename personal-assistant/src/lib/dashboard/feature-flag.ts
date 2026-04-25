/**
 * feature-flag.ts — Dashboard modes feature flag helper.
 *
 * Gates the entire mode system behind NEXT_PUBLIC_BITBIT_DASHBOARD_MODES.
 * When the flag is off (default), the dashboard is pixel-identical to
 * the pre-mode baseline: no ModeSwitcher, no data-mode attribute, no
 * keydown listener, no mode-store initialization.
 *
 * Usage:
 *   import { isDashboardModesEnabled } from '@/lib/dashboard/feature-flag'
 *   if (isDashboardModesEnabled()) { ... }
 *
 * Enable locally:
 *   NEXT_PUBLIC_BITBIT_DASHBOARD_MODES=1 npm run dev
 *
 * Enable in Vercel:
 *   Set NEXT_PUBLIC_BITBIT_DASHBOARD_MODES=1 in project environment variables.
 */

/**
 * Returns true when the dashboard modes feature is enabled.
 *
 * Client-safe: reads from process.env (Next.js inlines NEXT_PUBLIC_* at
 * build time). Also accepts the legacy server-side name without the prefix
 * for backward compatibility in edge/API routes.
 */
export function isDashboardModesEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_BITBIT_DASHBOARD_MODES === '1' ||
    process.env.BITBIT_DASHBOARD_MODES === '1'
  );
}
