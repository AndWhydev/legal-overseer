import type { ChannelType } from '../channels/types'

/**
 * Maps BitBit ChannelType identifiers to Composio toolkit IDs.
 * Only includes channels that Composio can handle — custom bridges
 * (iMessage, WhatsApp, SMS, macOS Calendar/Reminders) are excluded.
 */
export const COMPOSIO_TOOLKIT_MAP: Partial<Record<ChannelType, string>> = {
  gmail: 'gmail',
  outlook: 'outlook',
  calendar: 'googlecalendar',
  asana: 'asana',
  calendly: 'calendly',
  stripe: 'stripe',
  slack: 'slack',
  xero: 'xero',
  instagram: 'instagram',
  facebook: 'facebookpages',
  telegram: 'telegram',
  clickup: 'clickup',
  wordpress: 'wordpress',
  ga4: 'googleanalytics',
  gsc: 'googlesearchconsole',
}

/** Channels that must stay on custom adapters (bridges, native macOS, direct carrier).
 * Note: 'calendar' is NOT here — Google Calendar uses Composio,
 * while macOS Calendar (AppleScript) is a separate adapter that coexists. */
export const CUSTOM_ONLY_CHANNELS: ChannelType[] = [
  'imessage',
  'whatsapp',
  'sms',
  'reminders',
  'sendblue',
  'cluely',
]

/**
 * Check if a channel type can be served by Composio.
 */
export function isComposioChannel(channel: ChannelType): boolean {
  return channel in COMPOSIO_TOOLKIT_MAP
}

/**
 * Get the Composio toolkit ID for a BitBit channel type.
 */
export function getToolkitId(channel: ChannelType): string | undefined {
  return COMPOSIO_TOOLKIT_MAP[channel]
}

/**
 * All channel types that Composio can handle.
 */
export function getComposioChannels(): ChannelType[] {
  return Object.keys(COMPOSIO_TOOLKIT_MAP) as ChannelType[]
}
