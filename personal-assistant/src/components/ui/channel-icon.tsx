'use client';

import {
  siGmail,
  siWhatsapp,
  siAsana,
  siCalendly,
  siStripe,
  siSlack,
  siApple,
  siProtonmail,
} from 'simple-icons';
import { SFEnvelope } from 'sf-symbols-lib';

const CHANNEL_MAP: Record<string, { path: string; title: string }> = {
  gmail: siGmail,
  whatsapp: siWhatsapp,
  outlook: siProtonmail, // no dedicated Outlook icon in simple-icons; use mail icon
  asana: siAsana,
  calendly: siCalendly,
  stripe: siStripe,
  slack: siSlack,
  imessage: siApple,
};

interface ChannelIconProps {
  channel?: string | null;
  size?: number;
  className?: string;
  color?: string;
}

export function resolveChannelIcon(channel?: string | null) {
  const normalized =
    typeof channel === 'string' ? channel.trim().toLowerCase() : '';

  return CHANNEL_MAP[normalized] ?? null;
}

export function ChannelIcon({ channel, size = 16, className, color }: ChannelIconProps) {
  const icon = resolveChannelIcon(channel);

  if (!icon) {
    return <SFEnvelope size={size} className={className} style={color ? { color } : undefined} />;
  }

  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill={color || 'currentColor'}
      width={size}
      height={size}
      className={className}
      aria-label={icon.title}
    >
      <path d={icon.path} />
    </svg>
  );
}
