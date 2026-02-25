// ============================================
// BitBit Agent Factory - Simple public API
// ============================================

import { loadTools, loadHandlers } from './tool-loader';
import { BitBitEngine } from './engine';
import type { Agent, AgentConfig, IncomingMessage, HandleResult } from './types';

/**
 * Create a BitBit agent instance
 *
 * @example
 * ```typescript
 * import { createAgent } from '@/lib/bitbit';
 *
 * const agent = await createAgent({
 *   tools: 'config/tools.yaml',
 *   policies: '.planning/CLIENT-PACK.md',
 * });
 *
 * const result = await agent.handle({
 *   message: "Where is my order CG-12345?",
 *   channel: 'email',
 *   sender: { type: 'customer', email: 'jane@example.com' },
 * });
 * ```
 */
export async function createAgent(config: AgentConfig): Promise<Agent> {
  // Load tools from YAML config
  const tools = loadTools(config.tools);
  const handlers = await loadHandlers(config.tools);

  // Create the engine
  const engine = new BitBitEngine(tools, handlers, config);

  // Return the simple Agent interface
  return {
    handle: (message: IncomingMessage): Promise<HandleResult> => {
      return engine.handle(message);
    },
  };
}
