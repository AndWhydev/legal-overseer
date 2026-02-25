import { NextRequest, NextResponse } from 'next/server';
import { analyzeItem } from '@/lib/analyze';
import { getItemById, saveAnalysisRecord } from '@/lib/queries';

export async function POST(request: NextRequest) {
  try {
    const { itemId } = await request.json();

    if (!itemId) {
      return NextResponse.json({ error: 'itemId required' }, { status: 400 });
    }

    const item = getItemById(itemId);
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const result = await analyzeItem(item);

    // Save to database
    const recordId = saveAnalysisRecord(itemId, result, 'claude-sonnet-4-20250514');

    return NextResponse.json({
      success: true,
      item_id: itemId,
      record_id: recordId,
      analysis: result,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
