import { getCreatorStudioIndustryConfig } from './industry-config'
import type {
  CreatorStudioApp,
  CreatorStudioDeck,
  CreatorStudioNotification,
  CreatorStudioNotificationInput,
  CreatorStudioRequest,
} from './types'

const APP_META: Record<CreatorStudioApp, { label: string; icon: string }> = {
  stripe: { label: 'Stripe', icon: '💳' },
  paypal: { label: 'PayPal', icon: '🅿️' },
  x: { label: 'X', icon: '✖️' },
  youtube: { label: 'YouTube', icon: '▶️' },
  shopify: { label: 'Shopify', icon: '🛍️' },
  custom: { label: 'Custom', icon: '🔔' },
}

function trimText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const next = value.trim()
  return next.length > 0 ? next : fallback
}

function normalizeAmount(value: unknown): string {
  if (typeof value !== 'string') return '$99.00'
  const next = value.trim()
  if (!next) return '$99.00'
  if (next.startsWith('$')) return next
  return `$${next}`
}

function buildMessage(input: CreatorStudioNotificationInput): {
  headline: string
  body: string
} {
  const app = input.app
  const from = trimText(input.from, 'new supporter')
  const amount = normalizeAmount(input.amount)
  const custom = trimText(input.message, '')

  if (custom) {
    return {
      headline: APP_META[app].label,
      body: custom,
    }
  }

  if (app === 'x') {
    return {
      headline: 'You got paid!',
      body: `${amount} deposited from your latest drop.`,
    }
  }

  if (app === 'youtube') {
    return {
      headline: 'Monetization update',
      body: `${amount} added to your creator balance.`,
    }
  }

  if (app === 'shopify') {
    return {
      headline: 'New order received',
      body: `${amount} paid by ${from}.`,
    }
  }

  if (app === 'paypal') {
    return {
      headline: 'Payment received',
      body: `${amount} from ${from}.`,
    }
  }

  return {
    headline: 'Payment successful',
    body: `${amount} from ${from}.`,
  }
}

function hideSensitiveText(text: string, hide: boolean): string {
  if (!hide) return text
  return text.replace(/[A-Za-z0-9@._-]/g, '•')
}

function normalizeNotifications(
  raw: CreatorStudioNotificationInput[] | undefined,
  maxNotifications: number,
  allowedApps: CreatorStudioApp[],
  hideSensitive: boolean
): CreatorStudioNotification[] {
  const fallback: CreatorStudioNotificationInput[] = [
    { app: 'stripe', amount: '$199', from: 'launch@client.com', timeAgo: '3m ago' },
  ]

  const source = raw && raw.length > 0 ? raw : fallback

  return source.slice(0, maxNotifications).map((item, idx) => {
    const app = allowedApps.includes(item.app) ? item.app : allowedApps[0] ?? 'custom'
    const text = buildMessage({ ...item, app })
    const timeAgo = trimText(item.timeAgo, `${idx + 1}m ago`)
    const fromMasked = hideSensitiveText(text.body, hideSensitive)

    return {
      id: item.id?.trim() || `n${idx + 1}`,
      app,
      appLabel: APP_META[app].label,
      icon: APP_META[app].icon,
      timeAgo,
      headline: text.headline,
      body: fromMasked,
    }
  })
}

export function createDefaultCreatorStudioRequest(industry?: string): CreatorStudioRequest {
  const config = getCreatorStudioIndustryConfig(industry)
  return {
    industry,
    carrier: config.defaults.carrier,
    clock: config.defaults.clock,
    dateLabel: config.defaults.dateLabel,
    device: config.defaults.device,
    wallpaper: config.defaults.wallpaper,
    hideSensitive: config.defaults.hideSensitive,
    moduleOrder: [...config.defaultModuleOrder],
    notifications: [
      { app: 'stripe', amount: '$249', from: 'subscriber@fanmail.com', timeAgo: '2m ago' },
      { app: 'paypal', amount: '$89', from: 'brand@partner.co', timeAgo: '9m ago' },
    ],
  }
}

export function composeCreatorStudioDeck(request: CreatorStudioRequest): CreatorStudioDeck {
  const industry = trimText(request.industry, 'agency')
  const config = getCreatorStudioIndustryConfig(industry)

  const hideSensitive = Boolean(request.hideSensitive)
  const moduleOrder = request.moduleOrder?.length
    ? request.moduleOrder
    : config.defaultModuleOrder

  const notifications = normalizeNotifications(
    request.notifications,
    config.maxNotifications,
    config.allowedApps,
    hideSensitive
  )

  const topAmount =
    (typeof request.notifications?.[0]?.amount === 'string' && request.notifications[0].amount.trim()
      ? normalizeAmount(request.notifications[0].amount)
      : notifications[0]?.body.match(/\$[0-9,.]+/)?.[0]) ?? '$0'
  const stacks = notifications.length

  return {
    meta: {
      industry,
      watermark: config.watermark,
      generatedAt: new Date().toISOString(),
      maxNotifications: config.maxNotifications,
      moduleOrder: [...moduleOrder],
      allowedApps: [...config.allowedApps],
    },
    scene: {
      carrier: trimText(request.carrier, config.defaults.carrier ?? 'Airtel'),
      clock: trimText(request.clock, config.defaults.clock ?? '6:56'),
      dateLabel: trimText(request.dateLabel, config.defaults.dateLabel ?? 'Thursday'),
      device: request.device ?? config.defaults.device ?? 'iphone',
      wallpaper: request.wallpaper ?? config.defaults.wallpaper ?? 'sunset-grid',
      hideSensitive,
    },
    notifications,
    caption: `${stacks} social-proof notification${stacks === 1 ? '' : 's'} staged for ${industry}.`,
    shareHook: `Top alert shows ${topAmount}. Rotate angles and post variations for your next content run.`,
  }
}
