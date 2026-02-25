// ============================================
// BitBit - AI Customer Support Agent
// ============================================
//
// Simple API for creating intelligent support agents.
//
// @example
// ```typescript
// import { createAgent } from '@/lib/bitbit';
//
// const agent = await createAgent({
//   tools: 'config/tools.yaml',
//   policies: '.planning/CLIENT-PACK.md',
// });
//
// const result = await agent.handle({
//   message: "Where is my order?",
//   channel: 'whatsapp',
//   sender: { type: 'customer' },
// });
// ```

export { createAgent } from './agent';
export type {
  Agent,
  AgentConfig,
  IncomingMessage,
  HandleResult,
  AgentAction,
  Routing,
  Sender,
  SenderType,
  MessageChannel,
} from './types';
