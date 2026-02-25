// ============================================
// Agent Routing Logic
// ============================================
// Determines how to route messages based on sender, intent, and confidence

import type { SenderType } from './types';

/**
 * Routing decision for a message
 */
export interface RoutingDecision {
  /** Which queue to route to */
  queue: 'xixi' | 'allen' | 'auto';

  /** Whether the agent can auto-resolve this without human approval */
  auto_resolve: boolean;

  /** Reason for the routing decision */
  reason: string;

  /** Detected intent of the message */
  intent: MessageIntent;
}

/**
 * Message intent categories
 */
export type MessageIntent =
  | 'wismo' // Where is my order?
  | 'return' // Return/refund request
  | 'complaint' // General complaint
  | 'safety_complaint' // Safety-related complaint
  | 'product_question' // Product usage/info question
  | 'delivery_issue' // Delivered but not received, damaged, etc.
  | 'stock_issue' // Stock/inventory question
  | 'shipping_exception' // Carrier delays, lost packages
  | 'content_approval' // Content for approval
  | 'wholesale' // Wholesale/distributor inquiry
  | 'media_request' // Media/interview request
  | 'general'; // General inquiry

/**
 * Intent detection patterns
 */
const INTENT_PATTERNS: { intent: MessageIntent; patterns: RegExp[] }[] = [
  {
    intent: 'wismo',
    patterns: [
      /where\s+is\s+my\s+order/i,
      /order\s+status/i,
      /tracking\s+(number|info|update)/i,
      /when\s+will\s+(it|my\s+order)\s+(arrive|ship|be\s+delivered)/i,
      /has\s+(it|my\s+order)\s+shipped/i,
      /\bwismo\b/i,
    ],
  },
  {
    intent: 'safety_complaint',
    patterns: [
      /\b(allergic|allergy|reaction|rash|burn|sick|ill|injured|hurt|unsafe|hospital|doctor|emergency)\b/i,
      /made\s+me\s+sick/i,
      /skin\s+(reaction|irritation|burning)/i,
    ],
  },
  {
    intent: 'return',
    patterns: [
      /\b(return|refund|exchange|store\s+credit)\b/i,
      /want\s+(my\s+money\s+back|to\s+return)/i,
      /can\s+i\s+(return|get\s+a\s+refund)/i,
      /change\s+of\s+mind/i,
    ],
  },
  {
    intent: 'delivery_issue',
    patterns: [
      /delivered\s+but\s+(not\s+received|didn't\s+receive|never\s+got)/i,
      /didn't\s+receive\s+(my\s+)?order/i,
      /package\s+(stolen|missing|lost|damaged)/i,
      /wrong\s+(item|product|address)/i,
      /missing\s+(item|product)/i,
      /\bdamaged\b/i,
    ],
  },
  {
    intent: 'complaint',
    patterns: [
      /\b(complaint|unhappy|disappointed|frustrated|upset|terrible|awful|worst)\b/i,
      /very\s+disappointed/i,
      /never\s+(ordering|buying)\s+again/i,
      /this\s+is\s+(unacceptable|ridiculous)/i,
    ],
  },
  {
    intent: 'product_question',
    patterns: [
      /how\s+(do|to)\s+use/i,
      /\b(instructions|directions|how\s+to)\b/i,
      /what\s+(is|are)\s+(the|this)\s+(product|glove|scrub)/i,
      /can\s+i\s+use\s+(it|this)\s+(on|with|for)/i,
      /sensitive\s+skin/i,
      /\bingredients?\b/i,
    ],
  },
  {
    intent: 'stock_issue',
    patterns: [
      /\b(out\s+of\s+stock|back\s+in\s+stock|stockout|inventory|restock)\b/i,
      /when\s+will\s+(it|this)\s+be\s+(available|back)/i,
    ],
  },
  {
    intent: 'shipping_exception',
    patterns: [
      /\b(carrier|auspost|australia\s+post|fedex|dhl|ups)\b.*\b(delay|issue|problem)/i,
      /shipping\s+(delay|issue|problem)/i,
      /\bexpo\b/i,
      /bulk\s+ship/i,
    ],
  },
  {
    intent: 'content_approval',
    patterns: [
      /\b(approve|approval|review)\b.*\b(content|post|ad|campaign|creative)\b/i,
      /\b(content|post|ad|campaign|creative)\b.*\b(approve|approval|review)\b/i,
      /\bugc\b/i,
      /social\s+media\s+(post|content)/i,
    ],
  },
  {
    intent: 'wholesale',
    patterns: [
      /\b(wholesale|bulk\s+order|distributor|reseller|b2b|business\s+to\s+business)\b/i,
      /buy\s+in\s+bulk/i,
      /large\s+order/i,
    ],
  },
  {
    intent: 'media_request',
    patterns: [
      /\b(media|press|journalist|interview|magazine|publication|feature)\b/i,
      /write\s+(an?\s+)?article/i,
      /story\s+(on|about)/i,
    ],
  },
];

/**
 * Detect the intent of a message
 *
 * Scans the message for patterns and returns the most likely intent.
 * If multiple intents match, returns the first match (patterns are ordered by priority).
 */
export function detectIntent(message: string): MessageIntent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return intent;
      }
    }
  }
  return 'general';
}

/**
 * Determine routing for a message based on sender type, intent, and confidence
 *
 * Routing rules:
 * - Customer messages: Route based on intent (simple WISMO → auto, complaints → xixi)
 * - Xixi messages: Keep in her queue unless ops-related
 * - Allen messages: Keep in his queue unless customer-facing
 *
 * Auto-resolve rules:
 * - Only if confidence > 80 AND intent is auto-resolvable
 * - WISMO with valid tracking: auto
 * - Product questions: auto
 * - Returns/refunds: needs approval
 * - Complaints: needs review
 * - Safety: NEVER auto
 */
export function determineRouting(
  message: string,
  senderType: SenderType,
  confidence: number
): RoutingDecision {
  const intent = detectIntent(message);

  // Safety complaints ALWAYS escalate to xixi, never auto-resolve
  if (intent === 'safety_complaint') {
    return {
      queue: 'xixi',
      auto_resolve: false,
      reason: 'Safety complaint requires human review',
      intent,
    };
  }

  // Route by sender type
  switch (senderType) {
    case 'customer':
      return routeCustomerMessage(intent, confidence);

    case 'xixi':
      return routeXixiMessage(intent, confidence);

    case 'allen':
      return routeAllenMessage(intent, confidence);

    default:
      return {
        queue: 'xixi',
        auto_resolve: false,
        reason: 'Unknown sender type, routing to Xixi for review',
        intent,
      };
  }
}

/**
 * Route customer messages
 */
function routeCustomerMessage(
  intent: MessageIntent,
  confidence: number
): RoutingDecision {
  const highConfidence = confidence >= 80;

  switch (intent) {
    case 'wismo':
      return {
        queue: 'auto',
        auto_resolve: highConfidence,
        reason: highConfidence
          ? 'Standard WISMO with high confidence - auto-resolving'
          : 'WISMO needs clarification or more context',
        intent,
      };

    case 'product_question':
      return {
        queue: 'auto',
        auto_resolve: highConfidence,
        reason: highConfidence
          ? 'Product question answered from knowledge base'
          : 'Product question may need additional context',
        intent,
      };

    case 'return':
      return {
        queue: 'xixi',
        auto_resolve: false,
        reason: 'Return/refund requests require approval',
        intent,
      };

    case 'delivery_issue':
      return {
        queue: 'xixi',
        auto_resolve: false,
        reason: 'Delivery issues require investigation and approval',
        intent,
      };

    case 'complaint':
      return {
        queue: 'xixi',
        auto_resolve: false,
        reason: 'Customer complaints require human review',
        intent,
      };

    case 'wholesale':
      return {
        queue: 'xixi',
        auto_resolve: false,
        reason: 'Wholesale inquiries need business owner review',
        intent,
      };

    case 'media_request':
      return {
        queue: 'xixi',
        auto_resolve: false,
        reason: 'Media requests need owner approval',
        intent,
      };

    default:
      return {
        queue: highConfidence ? 'auto' : 'xixi',
        auto_resolve: highConfidence,
        reason: highConfidence
          ? 'General inquiry handled with high confidence'
          : 'General inquiry needs human review',
        intent,
      };
  }
}

/**
 * Route messages from Xixi (team member)
 */
function routeXixiMessage(
  intent: MessageIntent,
  confidence: number
): RoutingDecision {
  // Operations-related intents go to Allen
  if (intent === 'stock_issue' || intent === 'shipping_exception') {
    return {
      queue: 'allen',
      auto_resolve: false,
      reason: 'Operations issue routed to Allen',
      intent,
    };
  }

  // Content approvals stay with Xixi
  if (intent === 'content_approval') {
    return {
      queue: 'xixi',
      auto_resolve: false,
      reason: 'Content approval ready for Xixi review',
      intent,
    };
  }

  // Most Xixi messages are for her to review drafts/summaries
  return {
    queue: 'xixi',
    auto_resolve: false,
    reason: 'Information prepared for Xixi review',
    intent,
  };
}

/**
 * Route messages from Allen (team member)
 */
function routeAllenMessage(
  intent: MessageIntent,
  confidence: number
): RoutingDecision {
  // Customer-facing issues go to Xixi
  if (
    intent === 'complaint' ||
    intent === 'return' ||
    intent === 'delivery_issue'
  ) {
    return {
      queue: 'xixi',
      auto_resolve: false,
      reason: 'Customer-facing issue routed to Xixi',
      intent,
    };
  }

  // Stock and shipping stay with Allen
  if (intent === 'stock_issue' || intent === 'shipping_exception') {
    return {
      queue: 'allen',
      auto_resolve: false,
      reason: 'Operations decision ready for Allen review',
      intent,
    };
  }

  // Default for Allen messages
  return {
    queue: 'allen',
    auto_resolve: false,
    reason: 'Information prepared for Allen review',
    intent,
  };
}

/**
 * Check if an intent can potentially be auto-resolved
 * (assuming high confidence)
 */
export function isAutoResolvableIntent(intent: MessageIntent): boolean {
  return intent === 'wismo' || intent === 'product_question' || intent === 'general';
}
