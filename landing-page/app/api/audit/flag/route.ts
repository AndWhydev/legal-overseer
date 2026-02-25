import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * Issue types for flagging sessions
 */
export type FlagIssueType =
  | 'wrong_action'
  | 'missed_action'
  | 'incorrect_response'
  | 'needs_policy_update'
  | 'other';

interface FlagRequest {
  session_id: string;
  issue_type: FlagIssueType;
  notes: string;
}

/**
 * POST /api/audit/flag
 *
 * Creates a task for reviewing a flagged session.
 * Uses the existing tasks table with a title prefix to identify audit flags.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as FlagRequest;
    const { session_id, issue_type, notes } = body;

    // Validate required fields
    if (!session_id) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 400 }
      );
    }

    if (!issue_type) {
      return NextResponse.json(
        { error: 'issue_type is required' },
        { status: 400 }
      );
    }

    // Validate issue_type
    const validIssueTypes: FlagIssueType[] = [
      'wrong_action',
      'missed_action',
      'incorrect_response',
      'needs_policy_update',
      'other',
    ];

    if (!validIssueTypes.includes(issue_type)) {
      return NextResponse.json(
        { error: `Invalid issue_type. Must be one of: ${validIssueTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Format issue type for display
    const issueTypeDisplay = issue_type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Build task title and description
    const title = `[Audit Flag] ${issueTypeDisplay}`;
    const description = JSON.stringify({
      type: 'audit_review',
      session_id,
      issue_type,
      notes: notes || '',
      flagged_at: new Date().toISOString(),
    });

    // Create task in database
    const result = db.prepare(`
      INSERT INTO tasks (title, owner, description, status)
      VALUES (?, 'xixi', ?, 'open')
    `).run(title, description);

    const taskId = result.lastInsertRowid as number;

    console.log(`[Audit Flag] Created task #${taskId} for session ${session_id} - ${issue_type}`);

    return NextResponse.json({
      success: true,
      task_id: taskId,
      message: `Flagged for review. Task #${taskId} created.`,
    });
  } catch (error) {
    console.error('[Audit Flag] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to flag session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/audit/flag
 *
 * Returns all audit flag tasks (tasks with title starting with "[Audit Flag]")
 */
export async function GET() {
  try {
    const rows = db.prepare(`
      SELECT * FROM tasks
      WHERE title LIKE '[Audit Flag]%'
      ORDER BY created_at DESC
    `).all() as Array<{
      id: number;
      title: string;
      owner: string;
      status: string;
      description: string | null;
      due_date: string | null;
      created_at: string;
    }>;

    // Parse the description JSON for each task
    const flags = rows.map(row => {
      let metadata = null;
      try {
        if (row.description) {
          metadata = JSON.parse(row.description);
        }
      } catch {
        // If description isn't valid JSON, use it as-is
      }

      return {
        id: row.id,
        title: row.title,
        owner: row.owner,
        status: row.status,
        created_at: row.created_at,
        metadata,
      };
    });

    return NextResponse.json({
      flags,
      count: flags.length,
    });
  } catch (error) {
    console.error('[Audit Flag] Error fetching flags:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch flags',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/audit/flag
 *
 * Marks a flag task as complete (dismisses the flag)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('task_id');

    if (!taskId) {
      return NextResponse.json(
        { error: 'task_id is required' },
        { status: 400 }
      );
    }

    const result = db.prepare(`
      UPDATE tasks
      SET status = 'done', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND title LIKE '[Audit Flag]%'
    `).run(parseInt(taskId, 10));

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Flag task not found' },
        { status: 404 }
      );
    }

    console.log(`[Audit Flag] Dismissed flag task #${taskId}`);

    return NextResponse.json({
      success: true,
      message: `Flag task #${taskId} dismissed.`,
    });
  } catch (error) {
    console.error('[Audit Flag] Error dismissing flag:', error);
    return NextResponse.json(
      {
        error: 'Failed to dismiss flag',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
