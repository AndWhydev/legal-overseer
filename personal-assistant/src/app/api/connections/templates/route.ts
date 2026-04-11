import { NextResponse } from 'next/server'
import { connectionTemplates } from '@/lib/connections'

export const dynamic = 'force-dynamic'

/**
 * GET /api/connections/templates
 * List all available connection templates. No auth required.
 */
export async function GET() {
  return NextResponse.json({ templates: connectionTemplates })
}
