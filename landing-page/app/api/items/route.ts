import { NextRequest, NextResponse } from 'next/server';
import { getItemsByLane, getItemCounts } from '@/lib/queries';
import type { Lane, ItemStatus, Priority, RiskLevel, FilterOptions } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Get lane (required)
    const lane = searchParams.get('lane') as Lane | null;
    if (!lane || (lane !== 'xixi' && lane !== 'allen')) {
      return NextResponse.json(
        { error: 'Invalid or missing lane parameter. Must be "xixi" or "allen".' },
        { status: 400 }
      );
    }

    // Build filter options
    const filters: Omit<FilterOptions, 'lane'> = {};

    const status = searchParams.get('status') as ItemStatus | null;
    if (status) {
      filters.status = status;
    }

    const type = searchParams.get('type');
    if (type) {
      filters.type = type;
    }

    const priority = searchParams.get('priority') as Priority | null;
    if (priority) {
      filters.priority = priority;
    }

    const riskLevel = searchParams.get('risk_level') as RiskLevel | null;
    if (riskLevel) {
      filters.risk_level = riskLevel;
    }

    const dueDate = searchParams.get('due_date') as FilterOptions['due_date_filter'] | null;
    if (dueDate) {
      filters.due_date_filter = dueDate;
    }

    // Fetch items
    const items = getItemsByLane(lane, filters);
    const counts = getItemCounts();

    return NextResponse.json({
      items,
      counts,
      lane,
      filters,
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch items' },
      { status: 500 }
    );
  }
}
