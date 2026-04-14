import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MandateLevel = 'infinite_autopilot' | 'supervised' | 'standard'

/** Channel through which a mandate was activated or deactivated */
export type ActivationChannel = 'dashboard' | 'whatsapp' | 'api' | 'onboarding' | 'admin'

export interface DelegationMandate {
  id: string
  org_id: string
  entity_id: string
  mandate_level: MandateLevel
  activated_at: string
  activated_via: string
  deactivated_at: string | null
  deactivated_via: string | null
}

export interface DelegationActionEntry {
  id: string
  org_id: string
  entity_id: string
  mandate_id: string | null
  action_type: string
  action_summary: string
  action_payload: Record<string, unknown>
  financial_impact: Record<string, unknown> | null
  evidence_urls: string[]
  fiduciary_evaluation: Record<string, unknown> | null
  agent_run_id: string | null
  created_at: string
}

export interface LogDelegatedActionParams {
  org_id: string
  entity_id: string
  mandate_id?: string | null
  action_type: string
  action_summary: string
  action_payload?: Record<string, unknown>
  financial_impact?: Record<string, unknown> | null
  evidence_urls?: string[]
  fiduciary_evaluation?: Record<string, unknown> | null
  agent_run_id?: string | null
}

// ---------------------------------------------------------------------------
// getEntityMandate — look up the active mandate for an entity
// ---------------------------------------------------------------------------

export async function getEntityMandate(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
): Promise<DelegationMandate | null> {
  const { data, error } = await supabase
    .from('delegation_mandates')
    .select('*')
    .eq('org_id', orgId)
    .eq('entity_id', entityId)
    .is('deactivated_at', null)
    .maybeSingle()

  if (error) {
    logger.warn('[delegation-mandate] getEntityMandate query failed', {
      error: error.message,
      orgId,
      entityId,
    })
    return null
  }

  return (data as DelegationMandate) ?? null
}

// ---------------------------------------------------------------------------
// setEntityMandate — revoke any active mandate and insert a new one
// ---------------------------------------------------------------------------

export async function setEntityMandate(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
  level: MandateLevel,
  via: ActivationChannel,
): Promise<DelegationMandate> {
  // Revoke existing active mandate first (idempotent)
  await revokeEntityMandate(supabase, orgId, entityId, via)

  const { data, error } = await supabase
    .from('delegation_mandates')
    .insert({
      org_id: orgId,
      entity_id: entityId,
      mandate_level: level,
      activated_via: via,
    })
    .select('*')
    .single<DelegationMandate>()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create delegation mandate')
  }

  logger.info('[delegation-mandate] Mandate set', {
    orgId,
    entityId,
    level,
    via,
    mandateId: data.id,
  })

  return data
}

// ---------------------------------------------------------------------------
// revokeEntityMandate — deactivate the current active mandate (if any)
// ---------------------------------------------------------------------------

export async function revokeEntityMandate(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
  via: ActivationChannel,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('delegation_mandates')
    .update({
      deactivated_at: new Date().toISOString(),
      deactivated_via: via,
    })
    .eq('org_id', orgId)
    .eq('entity_id', entityId)
    .is('deactivated_at', null)
    .select('id')

  if (error) {
    logger.warn('[delegation-mandate] revokeEntityMandate failed', {
      error: error.message,
      orgId,
      entityId,
    })
    return false
  }

  const revoked = (data?.length ?? 0) > 0
  if (revoked) {
    logger.info('[delegation-mandate] Mandate revoked', { orgId, entityId, via })
  }
  return revoked
}

// ---------------------------------------------------------------------------
// logDelegatedAction — record an action taken under delegation authority
// ---------------------------------------------------------------------------

export async function logDelegatedAction(
  supabase: SupabaseClient,
  params: LogDelegatedActionParams,
): Promise<DelegationActionEntry> {
  const { data, error } = await supabase
    .from('delegation_action_log')
    .insert({
      org_id: params.org_id,
      entity_id: params.entity_id,
      mandate_id: params.mandate_id ?? null,
      action_type: params.action_type,
      action_summary: params.action_summary,
      action_payload: params.action_payload ?? {},
      financial_impact: params.financial_impact ?? null,
      evidence_urls: params.evidence_urls ?? [],
      fiduciary_evaluation: params.fiduciary_evaluation ?? null,
      agent_run_id: params.agent_run_id ?? null,
    })
    .select('*')
    .single<DelegationActionEntry>()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to log delegated action')
  }

  return data
}

// ---------------------------------------------------------------------------
// getRecentDelegatedActions — for morning briefing / audit
// ---------------------------------------------------------------------------

export async function getRecentDelegatedActions(
  supabase: SupabaseClient,
  orgId: string,
  since: Date,
): Promise<DelegationActionEntry[]> {
  const { data, error } = await supabase
    .from('delegation_action_log')
    .select('*')
    .eq('org_id', orgId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    logger.warn('[delegation-mandate] getRecentDelegatedActions failed', {
      error: error.message,
      orgId,
    })
    return []
  }

  return (data ?? []) as DelegationActionEntry[]
}

// ---------------------------------------------------------------------------
// isEntityFullyDelegated — shortcut check for infinite_autopilot mandate
// ---------------------------------------------------------------------------

export async function isEntityFullyDelegated(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
): Promise<boolean> {
  const mandate = await getEntityMandate(supabase, orgId, entityId)
  return mandate?.mandate_level === 'infinite_autopilot'
}

// ---------------------------------------------------------------------------
// getEntityDelegationHistory — all mandates (active + historical) for entity
// ---------------------------------------------------------------------------

export async function getEntityDelegationHistory(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
): Promise<DelegationMandate[]> {
  const { data, error } = await supabase
    .from('delegation_mandates')
    .select('*')
    .eq('org_id', orgId)
    .eq('entity_id', entityId)
    .order('activated_at', { ascending: false })

  if (error) {
    logger.warn('[delegation-mandate] getEntityDelegationHistory failed', {
      error: error.message,
      orgId,
      entityId,
    })
    return []
  }

  return (data ?? []) as DelegationMandate[]
}

// ---------------------------------------------------------------------------
// getActionsForMandate — all actions logged under a specific mandate
// ---------------------------------------------------------------------------

export async function getActionsForMandate(
  supabase: SupabaseClient,
  mandateId: string,
): Promise<DelegationActionEntry[]> {
  const { data, error } = await supabase
    .from('delegation_action_log')
    .select('*')
    .eq('mandate_id', mandateId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.warn('[delegation-mandate] getActionsForMandate failed', {
      error: error.message,
      mandateId,
    })
    return []
  }

  return (data ?? []) as DelegationActionEntry[]
}

// ---------------------------------------------------------------------------
// getDelegationAuditSummary — aggregate summary for an entity's delegation
// ---------------------------------------------------------------------------

export interface DelegationAuditSummary {
  currentMandate: DelegationMandate | null
  totalMandates: number
  totalActions: number
  totalFinancialImpact: number
  lastActionAt: string | null
}

// ---------------------------------------------------------------------------
// aggregateDelegatedActionsByEntity — per-entity rollup for morning briefing
// ---------------------------------------------------------------------------

export interface DelegatedActionAggregate {
  entityId: string
  entityName: string
  mandateLevel: MandateLevel | null
  actionCount: number
  totalFinancialImpact: number
  topActions: Array<{
    summary: string
    actionType: string
    createdAt: string
    amount: number | null
  }>
}

/**
 * Group delegation_action_log entries by entity for a given time window,
 * join entity names, attach current mandate level, and return the rollup
 * sorted by action count descending. Used by the morning briefing to
 * surface "what BitBit did autonomously overnight".
 *
 * Fail-open: returns [] on any query error so the briefing still renders.
 */
export async function aggregateDelegatedActionsByEntity(
  supabase: SupabaseClient,
  orgId: string,
  since: Date,
): Promise<DelegatedActionAggregate[]> {
  // Pull actions in the window with a joined entity_nodes.name.
  const { data: actions, error: actionsError } = await supabase
    .from('delegation_action_log')
    .select('entity_id, action_type, action_summary, financial_impact, created_at, entity_nodes(name)')
    .eq('org_id', orgId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })

  if (actionsError) {
    logger.warn('[delegation-mandate] aggregateDelegatedActionsByEntity actions query failed', {
      error: actionsError.message,
      orgId,
    })
    return []
  }

  const rows = (actions ?? []) as Array<{
    entity_id: string
    action_type: string
    action_summary: string
    financial_impact: Record<string, unknown> | null
    created_at: string
    entity_nodes: { name: string } | { name: string }[] | null
  }>

  if (rows.length === 0) return []

  // Group by entity_id.
  const groups = new Map<string, DelegatedActionAggregate>()
  for (const row of rows) {
    const entityNode = Array.isArray(row.entity_nodes) ? row.entity_nodes[0] : row.entity_nodes
    const entityName = entityNode?.name ?? 'Unknown entity'

    let amount: number | null = null
    if (row.financial_impact && typeof row.financial_impact === 'object') {
      const raw = (row.financial_impact as Record<string, unknown>).amount
      if (typeof raw === 'number') amount = raw
    }

    let group = groups.get(row.entity_id)
    if (!group) {
      group = {
        entityId: row.entity_id,
        entityName,
        mandateLevel: null,
        actionCount: 0,
        totalFinancialImpact: 0,
        topActions: [],
      }
      groups.set(row.entity_id, group)
    }
    group.actionCount += 1
    if (amount !== null) group.totalFinancialImpact += amount
    if (group.topActions.length < 3) {
      group.topActions.push({
        summary: row.action_summary,
        actionType: row.action_type,
        createdAt: row.created_at,
        amount,
      })
    }
  }

  // Attach current mandate level per entity (parallel lookups, fail-open).
  const entityIds = Array.from(groups.keys())
  const mandates = await Promise.all(
    entityIds.map((id) => getEntityMandate(supabase, orgId, id)),
  )
  entityIds.forEach((id, idx) => {
    const g = groups.get(id)
    if (g) g.mandateLevel = mandates[idx]?.mandate_level ?? null
  })

  return Array.from(groups.values()).sort((a, b) => b.actionCount - a.actionCount)
}

export async function getDelegationAuditSummary(
  supabase: SupabaseClient,
  orgId: string,
  entityId: string,
): Promise<DelegationAuditSummary> {
  // Fetch current mandate and full history in parallel
  const [currentMandate, mandates] = await Promise.all([
    getEntityMandate(supabase, orgId, entityId),
    getEntityDelegationHistory(supabase, orgId, entityId),
  ])

  // Fetch all actions for this entity
  const { data: actions, error: actionsError } = await supabase
    .from('delegation_action_log')
    .select('*')
    .eq('org_id', orgId)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  if (actionsError) {
    logger.warn('[delegation-mandate] getDelegationAuditSummary actions query failed', {
      error: actionsError.message,
      orgId,
      entityId,
    })
  }

  const actionList = (actions ?? []) as DelegationActionEntry[]

  // Aggregate financial impact from all actions
  const totalFinancialImpact = actionList.reduce((sum, action) => {
    if (action.financial_impact && typeof action.financial_impact === 'object') {
      const amount = (action.financial_impact as Record<string, unknown>).amount
      if (typeof amount === 'number') {
        return sum + amount
      }
    }
    return sum
  }, 0)

  const lastActionAt = actionList.length > 0 ? actionList[0].created_at : null

  return {
    currentMandate,
    totalMandates: mandates.length,
    totalActions: actionList.length,
    totalFinancialImpact,
    lastActionAt,
  }
}
