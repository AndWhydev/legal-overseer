import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
}

/** Renders the real app-store icon for a given integration ID */
function AppIcon({ id, size = 20 }: { id: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/icons/integrations/${id}.png`}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: size * 0.22, objectFit: 'cover', display: 'block' }}
    />
  );
}

function makeIcon(id: string) {
  return function BrandIcon({ size = 20 }: IconProps) {
    return <AppIcon id={id} size={size} />;
  };
}

// Map integration IDs → icon components
export const BRAND_ICONS: Record<string, React.FC<IconProps>> = {
  gmail: makeIcon('gmail'),
  outlook: makeIcon('outlook'),
  whatsapp: makeIcon('whatsapp'),
  imessage: makeIcon('imessage'),
  slack: makeIcon('slack'),
  resend: makeIcon('resend'),
  asana: makeIcon('asana'),
  calendly: makeIcon('calendly'),
  'google-calendar': makeIcon('google-calendar'),
  notion: makeIcon('notion'),
  hubspot: makeIcon('hubspot'),
  'google-analytics': makeIcon('google-analytics'),
  stripe: makeIcon('stripe'),
};
