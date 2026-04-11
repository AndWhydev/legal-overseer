import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { computeRelationshipStrength } from '@/lib/intelligence/relationship-scorer'

/**
 * GET /api/contacts/:id/relationship
 *
 * Returns the relationship score + history for a single contact.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let orgId: string
  try {
    orgId = await getActiveOrgId(supabase, user.id)
  } catch {
    return NextResponse.json({ error: 'No active org' }, { status: 400 })
  }

  // Verify contact belongs to the org
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, name, relationship_strength, relationship_trend, last_interaction_at, relationship_scored_at')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (contactError || !contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Compute live score (not cached)
  const score = await computeRelationshipStrength(supabase, orgId, id)

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
    },
    relationship: {
      strength: score.strength,
      trend: score.trend,
      lastInteraction: score.lastInteraction?.toISOString() ?? null,
      topChannel: score.topChannel,
      daysSinceContact: score.daysSinceContact,
    },
    cached: {
      strength: contact.relationship_strength,
      trend: contact.relationship_trend,
      lastInteraction: contact.last_interaction_at,
      scoredAt: contact.relationship_scored_at,
    },
  })
}
