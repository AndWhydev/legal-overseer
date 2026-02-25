import { NextRequest, NextResponse } from 'next/server';
import { getSessionSummary, getSessionAuditTrail } from '@/lib/agent/audit';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

/**
 * GET /api/agent/session/[sessionId]
 *
 * Returns the full audit trail for a specific agent session.
 *
 * Query params:
 * - full: Return full session summary with metadata (default true)
 * - trail_only: Return only the raw audit trail entries (true/false)
 *
 * Response format (full):
 * {
 *   session_id: string;
 *   started_at: string;
 *   completed_at: string;
 *   request: { message, channel, sender_type };
 *   trail: AuditLogEntry[];
 *   outcome: {
 *     response: string;
 *     actions_count: number;
 *     escalated: boolean;
 *     confidence: number;
 *   };
 * }
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const trailOnly = searchParams.get('trail_only') === 'true';

    if (trailOnly) {
      const trail = getSessionAuditTrail(sessionId);

      if (trail.length === 0) {
        return NextResponse.json(
          { error: `Session ${sessionId} not found` },
          { status: 404 }
        );
      }

      return NextResponse.json({
        session_id: sessionId,
        trail,
        count: trail.length,
      });
    }

    // Return full session summary
    const summary = getSessionSummary(sessionId);

    if (!summary) {
      return NextResponse.json(
        { error: `Session ${sessionId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[Session API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch session details',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
