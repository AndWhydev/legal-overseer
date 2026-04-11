/**
 * Personalised greeting for the chat empty state.
 * Matches claude.ai's greeting system — time, day-of-week, and casual variants.
 */

export interface GreetingMeta {
  firstName?: string
}

// ── Time buckets ──

type TimeBucket = 'morning' | 'afternoon' | 'evening' | 'night'

function getTimeBucket(hour: number): TimeBucket {
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

// ── Greeting pools ──

const TIME_GREETINGS: Record<TimeBucket, string[]> = {
  morning: [
    'Good morning, {name}',
    'Good morning',
  ],
  afternoon: [
    'Good afternoon, {name}',
    'Good afternoon',
  ],
  evening: [
    'Good evening, {name}',
    'Good evening',
    'Evening, {name}',
    'Evening',
    'How was your day, {name}?',
    'How was your day?',
  ],
  night: [
    'Evening, {name}',
    'Evening',
  ],
}

const DAY_GREETINGS: Record<number, string[]> = {
  0: ['Happy Sunday, {name}', 'Happy Sunday', 'Sunday session, {name}?', 'Sunday session?'],
  1: ['Happy Monday, {name}', 'Happy Monday'],
  2: ['Happy Tuesday, {name}', 'Happy Tuesday'],
  3: ['Happy Wednesday, {name}', 'Happy Wednesday'],
  4: ['Happy Thursday, {name}', 'Happy Thursday'],
  5: ['Happy Friday, {name}', 'Happy Friday'],
  6: ['Happy Saturday, {name}', 'Happy Saturday', 'Welcome to the weekend, {name}', 'Welcome to the weekend'],
}

const CASUAL_GREETINGS: string[] = [
  'Hey there, {name}',
  'Hey there',
  'Hi {name}, how are you?',
  'Hi, how are you?',
  'How\'s it going, {name}?',
  'How\'s it going?',
  'What\'s new, {name}?',
  'What\'s new?',
  'Welcome, {name}',
  'Welcome',
]

// ── Selection logic ──

/** Daily seed so greeting stays consistent within a day but rotates across days. */
function dailySeed(salt = 0): number {
  const now = new Date()
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate() + salt
}

function pick<T>(pool: T[], salt = 0): T {
  return pool[dailySeed(salt) % pool.length]
}

function resolve(template: string, firstName?: string): string {
  if (!firstName) {
    // Pick the no-name variant: strip "{name}" patterns
    return template
      .replace(/,?\s*\{name\}/g, '')
      .replace(/\{name\}\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return template.replace(/\{name\}/g, firstName)
}

export function getPersonalisedGreeting(meta: GreetingMeta = {}): string {
  const { firstName } = meta
  const now = new Date()
  const hour = now.getHours()
  const day = now.getDay()
  const bucket = getTimeBucket(hour)

  // Weighted selection: 50% time, 30% day-of-week, 20% casual
  const roll = dailySeed(13) % 10

  let template: string

  if (roll < 5) {
    // Time-based (50%)
    template = pick(TIME_GREETINGS[bucket], 1)
  } else if (roll < 8) {
    // Day-of-week (30%)
    template = pick(DAY_GREETINGS[day], 2)
  } else {
    // Casual (20%)
    template = pick(CASUAL_GREETINGS, 3)
  }

  return resolve(template, firstName)
}
