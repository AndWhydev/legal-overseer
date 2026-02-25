// ============================================
// BitBit Engine - Internal orchestration
// ============================================

import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from '../claude';
import { buildSystemPrompt } from '../agent/prompt';
import { assessFullConfidence } from '../agent/confidence';
import { determineRouting } from '../agent/routing';
import { detectIntent } from '../agent/routing';
import { logRequest, logResponse, logError } from '../agent/audit';
import type { HandlerRegistry } from './tool-loader';
import type { IncomingMessage, HandleResult, AgentAction, AgentConfig } from './types';

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sess_${timestamp}_${random}`;
}

/**
 * Build Claude message from incoming request
 */
function buildUserMessage(request: IncomingMessage): string {
  const { message, channel, sender, context } = request;

  let userMessage = `## Incoming Message

**Channel:** ${channel}
**Sender:** ${sender.type}${sender.name ? ` (${sender.name})` : ''}${sender.email ? ` - ${sender.email}` : ''}${sender.phone ? ` - ${sender.phone}` : ''}

**Message:**
${message}`;

  if (context?.order_number) {
    userMessage += `\n\n**Referenced Order:** ${context.order_number}`;
  }

  if (context?.previous_messages?.length) {
    userMessage += `\n\n**Previous Messages:**\n${context.previous_messages.join('\n')}`;
  }

  userMessage += `\n\n---\n\nPlease handle this request. Look up any relevant information, take appropriate action, and provide a response.`;

  return userMessage;
}

/**
 * Core engine for processing messages through Claude with tools
 */
export class BitBitEngine {
  private client: Anthropic;
  private tools: Anthropic.Tool[];
  private handlers: HandlerRegistry;
  private model: string;
  private maxIterations: number;

  constructor(
    tools: Anthropic.Tool[],
    handlers: HandlerRegistry,
    config: AgentConfig
  ) {
    this.client = getAnthropicClient();
    this.tools = tools;
    this.handlers = handlers;
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxIterations = config.maxIterations || 5;
  }

  /**
   * Process an incoming message and return the result
   */
  async handle(request: IncomingMessage): Promise<HandleResult> {
    const sessionId = generateSessionId();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[BitBit] New session: ${sessionId}`);
    console.log(`${'='.repeat(60)}`);

    try {
      // Log the request
      logRequest(
        sessionId,
        request.message,
        request.channel,
        request.sender.type,
        request.sender.email,
        request.sender.phone
      );

      // Detect intent early
      const detectedIntent = detectIntent(request.message);
      console.log(`[BitBit] Detected intent: ${detectedIntent}`);

      // Build messages
      const systemPrompt = buildSystemPrompt(request.sender.type);
      const userMessage = buildUserMessage(request);

      // Initialize conversation
      const actionsTaken: AgentAction[] = [];
      let messages: Anthropic.MessageParam[] = [
        { role: 'user', content: userMessage },
      ];

      // Tool use loop
      let iterations = 0;
      let finalResponse: Anthropic.Message | null = null;

      while (iterations < this.maxIterations) {
        iterations++;
        console.log(`\n[BitBit] Iteration ${iterations}/${this.maxIterations}`);

        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: this.tools,
          messages,
        });

        console.log(`[BitBit] Stop reason: ${response.stop_reason}`);

        if (response.stop_reason !== 'tool_use') {
          finalResponse = response;
          break;
        }

        // Process tool calls
        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        );

        if (toolUseBlocks.length === 0) {
          finalResponse = response;
          break;
        }

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          console.log(`[BitBit] Tool call: ${toolUse.name}`);
          const result = await this.executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            sessionId
          );

          actionsTaken.push({
            type: toolUse.name,
            params: toolUse.input as Record<string, unknown>,
            result: result.data,
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result.success
              ? JSON.stringify(result.data)
              : `Error: ${result.error}`,
            is_error: !result.success,
          });
        }

        messages = [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ];
      }

      if (!finalResponse) {
        throw new Error('Agent did not produce a final response');
      }

      // Extract text response
      const textBlocks = finalResponse.content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );
      const responseMessage = textBlocks.map((b) => b.text).join('\n');

      // Assess confidence
      const confidence = assessFullConfidence(request.message, responseMessage);
      console.log(`[BitBit] Confidence: ${confidence.level} (${confidence.score}%)`);

      // Determine routing
      const routingDecision = determineRouting(
        request.message,
        request.sender.type,
        confidence.score
      );

      const routing = {
        queue: routingDecision.queue,
        auto_resolve: confidence.should_escalate ? false : routingDecision.auto_resolve,
        reason: confidence.should_escalate
          ? `Escalation required: ${confidence.escalation_reason || 'Low confidence'}`
          : routingDecision.reason,
        intent: routingDecision.intent,
      };

      const result: HandleResult = {
        message: responseMessage,
        actions_taken: actionsTaken,
        reasoning: confidence.escalation_reason
          ? `${confidence.reasoning}. Escalation: ${confidence.escalation_reason}`
          : confidence.reasoning,
        confidence: confidence.score,
        session_id: sessionId,
        should_escalate: confidence.should_escalate,
        routing,
      };

      // Log the response
      logResponse(
        sessionId,
        request,
        result,
        result.reasoning,
        confidence.score,
        confidence.should_escalate
      );

      console.log(`\n[BitBit] Session complete: ${sessionId}`);
      return result;
    } catch (error) {
      console.error('[BitBit] Error:', error);
      logError(sessionId, 'engine_processing', error instanceof Error ? error : 'Unknown error');
      throw error;
    }
  }

  /**
   * Execute a tool call using the handler registry
   */
  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    sessionId: string
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const handler = this.handlers.get(name);

    if (!handler) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    try {
      const data = await handler(input, sessionId);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
