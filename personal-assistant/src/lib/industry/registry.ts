import type { IndustryPack } from './types'
import { agencyPack } from './packs/agency'

export const INDUSTRY_PACKS: Record<string, IndustryPack> = {
  agency: agencyPack,
}

export const DEFAULT_INDUSTRY = 'agency'

/**
 * Resolve the industry pack for a given industry ID.
 * Falls back to the default (agency) pack for unknown industries.
 */
export function getPack(industry: string): IndustryPack {
  return INDUSTRY_PACKS[industry] ?? INDUSTRY_PACKS[DEFAULT_INDUSTRY]
}

/**
 * Resolve industry from env var (single-tenant) or explicit value (multi-tenant).
 * BITBIT_DEPLOYMENT env var acts as the industry selector for single-tenant deploys.
 */
export function resolveIndustry(explicit?: string | null): string {
  return explicit ?? process.env.BITBIT_DEPLOYMENT ?? DEFAULT_INDUSTRY
}
