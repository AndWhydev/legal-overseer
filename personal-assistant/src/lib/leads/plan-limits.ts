/**
 * Plan limits for lead discovery and outreach.
 * Enforced via Stripe subscription tier.
 */

export type PlanTier = 'free' | 'starter' | 'growth' | 'scale'

export interface PlanLimits {
  prospectsPerMonth: number
  maxCampaigns: number // 0 = no outreach, -1 = unlimited
  emailsPerMonth: number
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    prospectsPerMonth: 50,
    maxCampaigns: 0,
    emailsPerMonth: 0,
  },
  starter: {
    prospectsPerMonth: 250,
    maxCampaigns: 1,
    emailsPerMonth: 750,
  },
  growth: {
    prospectsPerMonth: 1500,
    maxCampaigns: 3,
    emailsPerMonth: 5000,
  },
  scale: {
    prospectsPerMonth: 5000,
    maxCampaigns: -1,
    emailsPerMonth: 15000,
  },
}

export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLAN_LIMITS[tier] ?? PLAN_LIMITS.free
}

export function canDiscover(tier: PlanTier, usedThisMonth: number): boolean {
  const limits = getPlanLimits(tier)
  return usedThisMonth < limits.prospectsPerMonth
}

export function canCreateCampaign(tier: PlanTier, activeCampaigns: number): boolean {
  const limits = getPlanLimits(tier)
  if (limits.maxCampaigns === 0) return false
  if (limits.maxCampaigns === -1) return true
  return activeCampaigns < limits.maxCampaigns
}

export function canSendEmail(tier: PlanTier, sentThisMonth: number): boolean {
  const limits = getPlanLimits(tier)
  if (limits.emailsPerMonth === 0) return false
  return sentThisMonth < limits.emailsPerMonth
}

export function getRemainingProspects(tier: PlanTier, usedThisMonth: number): number {
  const limits = getPlanLimits(tier)
  return Math.max(0, limits.prospectsPerMonth - usedThisMonth)
}

export function getRemainingEmails(tier: PlanTier, sentThisMonth: number): number {
  const limits = getPlanLimits(tier)
  return Math.max(0, limits.emailsPerMonth - sentThisMonth)
}
