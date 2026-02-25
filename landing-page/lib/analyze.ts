import { getAnthropicClient } from './claude';
import { getPolicies } from './policies';
import type { ApprovalItem, AnalysisResult } from './types';

const SYSTEM_PROMPT = `You are BitBit, an AI assistant for CheekyGlo. You analyze approval items and provide structured recommendations.

You must respond with a JSON object matching this exact schema:
{
  "summary": "2-3 sentence summary of the item",
  "recommendation": "approve" | "needs_changes" | "reject" | "escalate",
  "confidence": 0-100,
  "reasoning": "Why this recommendation",
  "risk_flags": [{"severity": "low|medium|high", "category": "category", "description": "description"}],
  "draft_response": "Draft reply text or null if not applicable",
  "questions_for_human": ["Questions if confidence is low"],
  "suggested_tasks": [{"title": "task", "owner": "xixi|allen", "due_days": 3, "description": "details"}],
  "policies_applied": ["List of policy sections used"]
}

IMPORTANT:
- If confidence < 70, add questions_for_human
- Always cite which policies from the Client Pack you applied
- For customer emails, always draft a response
- For escalation triggers (legal threats, chargebacks, safety), set recommendation to "escalate"`;

export async function analyzeItem(item: ApprovalItem): Promise<AnalysisResult> {
  const startTime = Date.now();
  const policies = getPolicies();

  const userPrompt = `Analyze this ${item.lane} queue item:

Type: ${item.type}
Subject: ${item.subject}
From: ${item.sender_name || 'Unknown'} <${item.sender_email || 'no email'}>

Content:
${item.body}

${item.order_number ? `Order #: ${item.order_number}` : ''}
${item.tracking_number ? `Tracking #: ${item.tracking_number}` : ''}
${item.delivery_status ? `Delivery Status: ${item.delivery_status}` : ''}
${item.has_shipping_insurance ? 'Has shipping insurance: Yes' : ''}
${item.asset_link ? `Asset Link: ${item.asset_link}` : ''}
${item.platform ? `Platform: ${item.platform}` : ''}

Provide your analysis as a JSON object.`;

  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: SYSTEM_PROMPT + '\n\nClient Pack (Policy Reference):\n' + policies,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  // Parse JSON from response (handle markdown code blocks if present)
  let jsonStr = content.text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  const result = JSON.parse(jsonStr.trim()) as Omit<AnalysisResult, 'generation_time_ms'>;

  return {
    ...result,
    generation_time_ms: Date.now() - startTime,
  };
}
