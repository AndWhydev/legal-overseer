import Anthropic from '@anthropic-ai/sdk';

// ============================================
// Agent Tools - Claude tool definitions for BitBit
// ============================================

/**
 * All available tools for the BitBit agent.
 * Each tool has:
 * - name: unique identifier
 * - description: what it does AND when to use it
 * - input_schema: JSON Schema for parameters
 */
export const agentTools: Anthropic.Tool[] = [
  // ==========================================
  // 1. LOOKUP ORDER
  // ==========================================
  {
    name: 'lookup_order',
    description: `Look up an order by order number or tracking number.

Use this tool when:
- Customer asks "where is my order" (WISMO)
- Customer provides an order number (e.g., "CG-12345")
- Customer provides a tracking number
- You need to check order status, items, or delivery info

Returns: Order details including status, items, shipping address, tracking, and dates.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        order_number: {
          type: 'string',
          description: 'The order number (e.g., "CG-12345")',
        },
        tracking_number: {
          type: 'string',
          description: 'The tracking number if order number is not available',
        },
      },
      required: [],
    },
  },

  // ==========================================
  // 2. GET SHIPPING STATUS
  // ==========================================
  {
    name: 'get_shipping_status',
    description: `Get detailed shipping status for an order.

Use this tool when:
- Customer specifically asks about shipping/delivery timeline
- You need estimated delivery date
- Order has been shipped and you need carrier details
- You need to know days since shipment

Returns: Shipping status, tracking number, carrier, ship date, estimated delivery, and days in transit.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        order_number: {
          type: 'string',
          description: 'The order number to check shipping for',
        },
      },
      required: ['order_number'],
    },
  },

  // ==========================================
  // 3. GET CUSTOMER HISTORY
  // ==========================================
  {
    name: 'get_customer_history',
    description: `Get a customer's full profile and order history.

Use this tool when:
- You need to see a customer's past orders
- Checking if customer is a repeat buyer
- Need to understand customer's total spend/value
- Customer doesn't have an order number but you have their email

Returns: Customer profile with all orders, total spent, and order count.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string',
          description: 'Customer email address',
        },
      },
      required: ['email'],
    },
  },

  // ==========================================
  // 4. SEND REPLY
  // ==========================================
  {
    name: 'send_reply',
    description: `Send a reply to the customer via their preferred channel.

Use this tool when:
- You have information to share with the customer
- Confirming order status
- Answering product questions
- Providing tracking information
- Responding to any customer inquiry

IMPORTANT: Always use CheekyGlo brand voice - friendly, helpful, premium but approachable.
For email, include subject line. For WhatsApp/SMS, keep messages concise.

Returns: Confirmation of message sent with message ID.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        channel: {
          type: 'string',
          enum: ['email', 'whatsapp', 'sms'],
          description: 'Channel to send the reply through',
        },
        to: {
          type: 'string',
          description: 'Recipient (email address or phone number)',
        },
        message: {
          type: 'string',
          description: 'The message body to send',
        },
        subject: {
          type: 'string',
          description: 'Email subject line (required for email, ignored for other channels)',
        },
      },
      required: ['channel', 'to', 'message'],
    },
  },

  // ==========================================
  // 5. CREATE TASK
  // ==========================================
  {
    name: 'create_task',
    description: `Create a task for Xixi or Allen to follow up on.

Use this tool when:
- Issue needs human follow-up
- Creating reminders for team members
- Something requires manual action (refund processing, vendor contact)
- Logging items for the operations queue

Route to:
- Xixi: Customer support, content approval, brand/marketing issues
- Allen: Operations, shipping exceptions, inventory, vendor issues

Returns: Created task with ID and details.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Brief task title describing what needs to be done',
        },
        owner: {
          type: 'string',
          enum: ['xixi', 'allen'],
          description: 'Who should handle this task',
        },
        description: {
          type: 'string',
          description: 'Detailed description with context and any relevant order/customer info',
        },
        due_days: {
          type: 'number',
          description: 'Days from now until due (optional, defaults to no due date)',
        },
      },
      required: ['title', 'owner'],
    },
  },

  // ==========================================
  // 6. CHECK INVENTORY
  // ==========================================
  {
    name: 'check_inventory',
    description: `Check stock levels and product information for a SKU.

Use this tool when:
- Customer asks about product availability
- Need to check if item is in stock before promising fulfillment
- Allen asks about inventory levels
- Checking if reorder is needed

Returns: Stock count, in-stock status, low-stock warning, and product details.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        sku: {
          type: 'string',
          description: 'Product SKU to check (e.g., "CG-GLOVE-REG")',
        },
      },
      required: ['sku'],
    },
  },

  // ==========================================
  // 7. ESCALATE
  // ==========================================
  {
    name: 'escalate',
    description: `Escalate an issue to human review immediately.

Use this tool when:
- Legal threats or chargeback mentions
- Safety complaints about products
- Influencer contract disputes
- Policy edge cases you're unsure about
- Customer is very upset or situation is complex
- Confidence in correct action is low (<50%)

This creates an urgent task and flags for immediate human attention.

Returns: Acknowledgment with escalation ID.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          description: 'Why this needs human attention',
        },
        category: {
          type: 'string',
          enum: ['legal', 'safety', 'chargeback', 'influencer', 'policy_edge_case', 'customer_upset', 'other'],
          description: 'Category of escalation',
        },
        context: {
          type: 'string',
          description: 'Full context including any order numbers, customer info, and conversation history',
        },
        suggested_owner: {
          type: 'string',
          enum: ['xixi', 'allen'],
          description: 'Suggested person to handle (xixi for customer issues, allen for ops)',
        },
      },
      required: ['reason', 'category', 'context'],
    },
  },
];

/**
 * Get a specific tool by name
 */
export function getToolByName(name: string): Anthropic.Tool | undefined {
  return agentTools.find((tool) => tool.name === name);
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
  return agentTools.map((tool) => tool.name);
}
