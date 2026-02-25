// ============================================
// Agent Types - Core interfaces for BitBit agent
// ============================================

/**
 * Communication channels supported by BitBit
 */
export type MessageChannel = 'whatsapp' | 'email' | 'voice' | 'sms' | 'telegram';

/**
 * Sender types - who initiated the message
 */
export type SenderType = 'customer' | 'xixi' | 'allen';

/**
 * Incoming request to the agent
 */
export interface AgentRequest {
  /** The message content (can be voice transcript) */
  message: string;

  /** Channel the message came from */
  channel: MessageChannel;

  /** Information about the sender */
  sender: {
    type: SenderType;
    email?: string;
    phone?: string;
    name?: string;
  };

  /** Optional additional context */
  context?: {
    /** If message references a specific order */
    order_number?: string;
    /** Previous messages in conversation */
    previous_messages?: string[];
  };
}

/**
 * A single action taken by the agent
 */
export interface AgentAction {
  /** The type of action (tool name) */
  type: string;

  /** Parameters passed to the action */
  params: Record<string, unknown>;

  /** Result returned from the action */
  result: unknown;
}

/**
 * Routing information for the response
 */
export interface AgentRouting {
  /** Queue to route to */
  queue: 'xixi' | 'allen' | 'auto';

  /** Whether the agent can auto-resolve without human approval */
  auto_resolve: boolean;

  /** Reason for the routing decision */
  reason: string;

  /** Detected intent of the message */
  intent: string;
}

/**
 * Response from the agent after processing a request
 */
export interface AgentResponse {
  /** The response message to send back to the user */
  message: string;

  /** List of actions the agent took to handle the request */
  actions_taken: AgentAction[];

  /** Agent's reasoning for the actions taken */
  reasoning: string;

  /** Confidence level 0-100 */
  confidence: number;

  /** Unique session ID for audit trail */
  session_id: string;

  /** True if confidence < 50%, indicating human review needed */
  should_escalate: boolean;

  /** Routing decision for this message */
  routing?: AgentRouting;
}

/**
 * Tool execution result from the executor
 */
export interface ToolExecutionResult {
  /** Result data from the tool */
  result: unknown;

  /** Error message if execution failed */
  error?: string;

  /** Whether the execution succeeded */
  success: boolean;
}
