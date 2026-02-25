import { NextRequest, NextResponse } from 'next/server';
import { createAgent } from '@/lib/bitbit';

// Create agent once at startup
const agentPromise = createAgent({
  tools: 'config/tools.yaml',
  policies: '.planning/CLIENT-PACK.md',
});

export async function POST(request: NextRequest) {
  try {
    const { message, channel, sender, context } = await request.json();

    if (!message || !channel || !sender?.type) {
      return NextResponse.json(
        { error: 'message, channel, and sender.type are required' },
        { status: 400 }
      );
    }

    const agent = await agentPromise;
    const result = await agent.handle({ message, channel, sender, context });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Agent] Error:', error);
    return NextResponse.json(
      { error: 'Agent processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
