export type CreatorStudioApp = 'stripe' | 'paypal' | 'x' | 'youtube' | 'shopify' | 'custom'

export type CreatorStudioDevice = 'iphone' | 'android'

export type CreatorStudioWallpaper =
  | 'sunset-grid'
  | 'night-wave'
  | 'paper-grain'
  | 'neon-city'

export type CreatorStudioModuleId =
  | 'scene'
  | 'notification-stack'
  | 'appearance'
  | 'privacy'
  | 'export'

export interface CreatorStudioNotificationInput {
  id?: string
  app: CreatorStudioApp
  amount?: string
  from?: string
  message?: string
  timeAgo?: string
}

export interface CreatorStudioRequest {
  industry?: string
  carrier?: string
  clock?: string
  dateLabel?: string
  device?: CreatorStudioDevice
  wallpaper?: CreatorStudioWallpaper
  hideSensitive?: boolean
  moduleOrder?: CreatorStudioModuleId[]
  notifications?: CreatorStudioNotificationInput[]
}

export interface CreatorStudioNotification {
  id: string
  app: CreatorStudioApp
  appLabel: string
  icon: string
  timeAgo: string
  headline: string
  body: string
}

export interface CreatorStudioDeck {
  meta: {
    industry: string
    watermark: string
    generatedAt: string
    maxNotifications: number
    moduleOrder: CreatorStudioModuleId[]
    allowedApps: CreatorStudioApp[]
  }
  scene: {
    carrier: string
    clock: string
    dateLabel: string
    device: CreatorStudioDevice
    wallpaper: CreatorStudioWallpaper
    hideSensitive: boolean
  }
  notifications: CreatorStudioNotification[]
  caption: string
  shareHook: string
}
