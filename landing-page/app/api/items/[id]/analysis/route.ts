import { NextRequest, NextResponse } from 'next/server';
import { getLatestAnalysis } from '@/lib/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const itemId = parseInt(id, 10);

  if (isNaN(itemId)) {
    return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 });
  }

  const analysis = getLatestAnalysis(itemId);

  return NextResponse.json({
    item_id: itemId,
    has_analysis: !!analysis,
    analysis: analysis,
  });
}
