import db from '../db';

// ============================================
// Messaging Types
// ============================================

export type MessageChannel = 'email' | 'whatsapp' | 'sms';

export interface MessageResult {
  success: boolean;
  message_id: string;
  channel: MessageChannel;
  recipient: string;
  sent_at: string;
  mock: true; // Always true for now - indicates this is a mock service
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  from?: string; // defaults to hello@cheekyglo.com
}

export interface SendWhatsAppParams {
  to: string; // phone number
  message: string;
}

export interface SendSMSParams {
  to: string; // phone number
  message: string;
}

// ============================================
// Helper Functions
// ============================================

function generateMessageId(): string {
  // Generate unique message ID
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `msg_${timestamp}_${random}`;
}

function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

function logAgentAction(
  actionType: string,
  input: object,
  output: object,
  sessionId: string = 'default'
): void {
  db.prepare(`
    INSERT INTO agent_actions (session_id, action_type, input, output)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, actionType, JSON.stringify(input), JSON.stringify(output));
}

// ============================================
// Messaging Service Functions (MOCK)
// ============================================

/**
 * Send an email (MOCK - logs to console, does not actually send)
 */
export async function sendEmail(params: SendEmailParams): Promise<MessageResult> {
  const { to, subject, body, from = 'hello@cheekyglo.com' } = params;

  console.log(`[MessagingService] EMAIL to ${to}: ${subject}`);
  console.log('  From:', from);
  console.log('  Body:');
  body.split('\n').forEach(line => {
    console.log('    |', line);
  });

  const result: MessageResult = {
    success: true,
    message_id: generateMessageId(),
    channel: 'email',
    recipient: to,
    sent_at: getCurrentTimestamp(),
    mock: true,
  };

  logAgentAction('send_email', { to, subject, body, from }, result);

  return result;
}

/**
 * Send a WhatsApp message (MOCK - logs to console, does not actually send)
 */
export async function sendWhatsApp(params: SendWhatsAppParams): Promise<MessageResult> {
  const { to, message } = params;

  const preview = message.length > 50 ? message.slice(0, 50) + '...' : message;
  console.log(`[MessagingService] WHATSAPP to ${to}: ${preview}`);
  console.log('  Full message:');
  message.split('\n').forEach(line => {
    console.log('    |', line);
  });

  const result: MessageResult = {
    success: true,
    message_id: generateMessageId(),
    channel: 'whatsapp',
    recipient: to,
    sent_at: getCurrentTimestamp(),
    mock: true,
  };

  logAgentAction('send_whatsapp', { to, message }, result);

  return result;
}

/**
 * Send an SMS message (MOCK - logs to console, does not actually send)
 */
export async function sendSMS(params: SendSMSParams): Promise<MessageResult> {
  const { to, message } = params;

  const preview = message.length > 50 ? message.slice(0, 50) + '...' : message;
  console.log(`[MessagingService] SMS to ${to}: ${preview}`);

  const result: MessageResult = {
    success: true,
    message_id: generateMessageId(),
    channel: 'sms',
    recipient: to,
    sent_at: getCurrentTimestamp(),
    mock: true,
  };

  logAgentAction('send_sms', { to, message }, result);

  return result;
}

/**
 * Get log of all messages sent (queries agent_actions table)
 */
export function getMessageLog(sessionId?: string): MessageResult[] {
  const query = sessionId
    ? db.prepare(`
        SELECT output FROM agent_actions
        WHERE action_type IN ('send_email', 'send_whatsapp', 'send_sms')
        AND session_id = ?
        ORDER BY created_at DESC
      `)
    : db.prepare(`
        SELECT output FROM agent_actions
        WHERE action_type IN ('send_email', 'send_whatsapp', 'send_sms')
        ORDER BY created_at DESC
      `);

  const rows = sessionId ? query.all(sessionId) : query.all();

  console.log(`[MessagingService] getMessageLog(${sessionId || 'all'}) -> ${rows.length} messages`);

  return rows.map((row: any) => JSON.parse(row.output) as MessageResult);
}
