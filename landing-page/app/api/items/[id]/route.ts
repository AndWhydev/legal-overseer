import { NextRequest, NextResponse } from 'next/server';
import { getItemById, getAuditLogForItem } from '@/lib/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const itemId = parseInt(id, 10);

  if (isNaN(itemId)) {
    return NextResponse.json(
      { error: 'Invalid item ID' },
      { status: 400 }
    );
  }

  const item = getItemById(itemId);

  if (!item) {
    return NextResponse.json(
      { error: 'Item not found' },
      { status: 404 }
    );
  }

  const auditLog = getAuditLogForItem(itemId);

  return NextResponse.json({
    item,
    auditLog,
  });
}
