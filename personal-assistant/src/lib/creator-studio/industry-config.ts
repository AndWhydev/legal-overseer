import type {
  CreatorStudioApp,
  CreatorStudioModuleId,
  CreatorStudioRequest,
} from './types'

export interface CreatorStudioIndustryConfig {
  maxNotifications: number
  allowedApps: CreatorStudioApp[]
  watermark: string
  defaultModuleOrder: CreatorStudioModuleId[]
  defaults: Pick<
    CreatorStudioRequest,
    'carrier' | 'clock' | 'dateLabel' | 'device' | 'wallpaper' | 'hideSensitive'
  >
}

const DEFAULT_MODULE_ORDER: CreatorStudioModuleId[] = [
  'scene',
  'notification-stack',
  'appearance',
  'privacy',
  'export',
]

const DEFAULT_CONFIG: CreatorStudioIndustryConfig = {
  maxNotifications: 4,
  allowedApps: ['stripe', 'paypal', 'x', 'youtube', 'shopify', 'custom'],
  watermark: 'Mockup for content planning',
  defaultModuleOrder: DEFAULT_MODULE_ORDER,
  defaults: {
    carrier: 'Airtel',
    clock: '6:56',
    dateLabel: 'Thursday 4 Jun',
    device: 'iphone',
    wallpaper: 'sunset-grid',
    hideSensitive: false,
  },
}

const CONTENT_CREATOR_CONFIG: CreatorStudioIndustryConfig = {
  ...DEFAULT_CONFIG,
  maxNotifications: 6,
  watermark: 'Creator package preview • simulated earnings alerts',
  defaults: {
    carrier: 'Creator Mobile',
    clock: '8:42',
    dateLabel: 'Launch Day',
    device: 'iphone',
    wallpaper: 'neon-city',
    hideSensitive: true,
  },
}

const AGENCY_CONFIG: CreatorStudioIndustryConfig = {
  ...DEFAULT_CONFIG,
  maxNotifications: 3,
  watermark: 'Agency social proof concept',
  defaults: {
    carrier: 'Airtel',
    clock: '10:15',
    dateLabel: 'Pitch Week',
    device: 'iphone',
    wallpaper: 'night-wave',
    hideSensitive: true,
  },
}

const TRADIE_CONFIG: CreatorStudioIndustryConfig = {
  ...DEFAULT_CONFIG,
  maxNotifications: 3,
  allowedApps: ['paypal', 'shopify', 'custom'],
  watermark: 'Quote + payment proof concept',
  defaults: {
    carrier: 'Field LTE',
    clock: '7:12',
    dateLabel: 'Monday Run',
    device: 'android',
    wallpaper: 'paper-grain',
    hideSensitive: true,
  },
}

const BY_INDUSTRY: Record<string, CreatorStudioIndustryConfig> = {
  agency: AGENCY_CONFIG,
  tradie: TRADIE_CONFIG,
  'content-creator': CONTENT_CREATOR_CONFIG,
}

export function getCreatorStudioIndustryConfig(industry?: string): CreatorStudioIndustryConfig {
  if (!industry) return DEFAULT_CONFIG
  return BY_INDUSTRY[industry] ?? DEFAULT_CONFIG
}

