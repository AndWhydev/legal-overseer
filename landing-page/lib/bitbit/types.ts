// ============================================
// BitBit Public Types - Simple, clean interfaces
// ============================================

/**
 * Communication channels supported by BitBit
 */
export type MessageChannel = 'whatsapp' | 'email' | 'voice' | 'sms' | 'telegram';

/**
 * Who is sending the message
 */
export type SenderType = 'customer' | 'xixi' | 'allen';

/**
 * Sender information
 */
export interface Sender {
  type: SenderType;
  email?: string;
  phone?: string;
  name?: string;
  telegramId?: number;
}

/**
 * Incoming message to handle
 */
export interface IncomingMessage {
  message: string;
  channel: MessageChannel;
  sender: Sender;
  context?: {
    order_number?: string;
    previous_messages?: string[];
  };
}

/**
 * Action taken by the agent
 */
export interface AgentAction {
  type: string;
  params: Record<string, unknown>;
  result: unknown;
}

/**
 * Routing decision
 */
export interface Routing {
  queue: 'xixi' | 'allen' | 'auto';
  auto_resolve: boolean;
  reason: string;
  intent: string;
}

/**
 * Result from handling a message
 */
export interface HandleResult {
  message: string;
  actions_taken: AgentAction[];
  reasoning: string;
  confidence: number;
  session_id: string;
  should_escalate: boolean;
  routing?: Routing;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Path to tools YAML config */
  tools: string;
  /** Path to policies markdown file */
  policies: string;
  /** Model to use (defaults to claude-sonnet-4-20250514) */
  model?: string;
  /** Max tool iterations (defaults to 5) */
  maxIterations?: number;
}

/**
 * The BitBit Agent interface
 */
export interface Agent {
  /** Handle an incoming message */
  handle(message: IncomingMessage): Promise<HandleResult>;
}
