import { logger } from '@/lib/core/logger'

/**
 * Synthesize text into a voice memo and send it via Sendblue as an iMessage audio bubble.
 * TODO: Implement TTS synthesis + Sendblue media upload when voice memo feature is ready.
 */
export async function sendVoiceMemoBubble(
  to: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  logger.warn('[sendblue-voice-memo] Voice memo sending not yet implemented', { to, textLength: text.length })
  return { success: false, error: 'Voice memo sending is not yet implemented' }
}
