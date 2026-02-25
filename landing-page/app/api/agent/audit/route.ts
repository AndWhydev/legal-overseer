import { NextRequest, NextResponse } from 'next/server';
import {
  getRecentAgentActivity,
  getRecentSessions,
  getActionCounts,
  type AuditActionType,
  type ActivityQueryOptions,
} from '@/lib/agent/audit';

/**
 * GET /api/agent/audit
 *
 * Returns recent agent activity for the audit dashboard.
 *
 * Query params:
 * - limit: Number of entries to return (default 50, max 200)
 * - offset: Offset for pagination
 * - action_type: Filter by action type (request, tool_call, response, escalation, error)
 * - success_only: Only return successful actions (true/false)
 * - sessions_only: Return unique session IDs instead of full entries (true/false)
 * - summary: Return action counts summary (true/false)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Check if requesting summary
    const summary = searchParams.get('summary') === 'true';
    if (summary) {
      const counts = getActionCounts();
      return NextResponse.json({
        summary: true,
        counts,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
      });
    }

    // Check if requesting sessions only
    const sessionsOnly = searchParams.get('sessions_only') === 'true';
    if (sessionsOnly) {
      const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
      const sessions = getRecentSessions(limit);
      return NextResponse.json({
        sessions,
        count: sessions.length,
      });
    }

    // Parse query options
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const actionTypeParam = searchParams.get('action_type');
    const successOnly = searchParams.get('success_only') === 'true';

    const options: ActivityQueryOptions = {
      limit,
      offset,
      success_only: successOnly,
    };

    // Validate action_type if provided
    if (actionTypeParam) {
      const validTypes: AuditActionType[] = ['request', 'tool_call', 'response', 'escalation', 'error'];
      if (!validTypes.includes(actionTypeParam as AuditActionType)) {
        return NextResponse.json(
          {
            error: `Invalid action_type. Must be one of: ${validTypes.join(', ')}`,
          },
          { status: 400 }
        );
      }
      options.action_type = actionTypeParam as AuditActionType;
    }

    const entries = getRecentAgentActivity(options);

    return NextResponse.json({
      entries,
      count: entries.length,
      pagination: {
        limit,
        offset,
        has_more: entries.length === limit,
      },
    });
  } catch (error) {
    console.error('[Audit API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch audit entries',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
