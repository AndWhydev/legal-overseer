interface DailyCounter {
  count: number
  date: string // YYYY-MM-DD UTC
}

const counters = new Map<string, DailyCounter>()

const DEFAULT_LIMITS: Record<string, number> = {
  tavily: 50,
  serper: 50,
  exa: 30,
}

function getLimit(provider: string): number | null {
  const envKey = `${provider.toUpperCase()}_DAILY_LIMIT`
  const envVal = process.env[envKey]
  if (envVal) return parseInt(envVal, 10)
  return DEFAULT_LIMITS[provider] ?? null
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function getCounter(provider: string): DailyCounter {
  const today = todayUTC()
  const existing = counters.get(provider)
  if (existing && existing.date === today) return existing
  const fresh: DailyCounter = { count: 0, date: today }
  counters.set(provider, fresh)
  return fresh
}

export function canUse(provider: string): boolean {
  const limit = getLimit(provider)
  if (limit === null) return true
  const counter = getCounter(provider)
  return counter.count < limit
}

export function recordUse(provider: string): void {
  const limit = getLimit(provider)
  if (limit === null) return
  const counter = getCounter(provider)
  counter.count++
}

export function getRemainingQuota(provider: string): number {
  const limit = getLimit(provider)
  if (limit === null) return Infinity
  const counter = getCounter(provider)
  return Math.max(0, limit - counter.count)
}

export function resetAll(): void {
  counters.clear()
}
