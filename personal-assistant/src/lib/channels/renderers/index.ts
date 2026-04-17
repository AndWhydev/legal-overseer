import type { Channel } from '@/lib/conversation/types';
import { renderForIMessage } from './imessage';
import { renderForWhatsApp } from './whatsapp';

export { renderForIMessage, renderForWhatsApp };

/**
 * Apply channel-specific markdown rendering rules before a response is sent.
 *
 * Channels like iMessage render markdown as literal characters, and WhatsApp
 * has its own inline formatting dialect. For channels that don't need any
 * transformation (web, email, slack, telegram, etc.) we return the text
 * unchanged.
 */
export function renderForChannel(text: string, channel: Channel): string {
  switch (channel) {
    case 'sendblue':
    case 'imessage':
    case 'sms':
      return renderForIMessage(text);
    case 'whatsapp':
      return renderForWhatsApp(text);
    default:
      return text;
  }
}
