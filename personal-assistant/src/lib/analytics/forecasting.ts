// ---------------------------------------------------------------------------
// forecasting.ts — Simple moving average, exponential smoothing, anomaly detection
// ---------------------------------------------------------------------------

export interface DataPoint {
  date: string   // ISO date string (YYYY-MM-DD)
  value: number
}

export interface ForecastPoint extends DataPoint {
  forecast: boolean
  lower?: number
  upper?: number
}

export interface AnomalyPoint extends DataPoint {
  isAnomaly: boolean
  zScore: number
  deviation: number
}

export interface TrendSeries {
  raw: DataPoint[]
  sma7: DataPoint[]
  sma30: DataPoint[]
  forecast: ForecastPoint[]
  anomalies: AnomalyPoint[]
  trend: 'up' | 'down' | 'flat'
  trendPct: number
}

// ---------------------------------------------------------------------------
// Simple Moving Average
// ---------------------------------------------------------------------------

export function sma(data: DataPoint[], window: number): DataPoint[] {
  if (data.length < window) return []

  const result: DataPoint[] = []
  for (let i = window - 1; i < data.length; i++) {
    const slice = data.slice(i - window + 1, i + 1)
    const avg = slice.reduce((sum, p) => sum + p.value, 0) / window
    result.push({ date: data[i].date, value: Math.round(avg * 100) / 100 })
  }
  return result
}

// ---------------------------------------------------------------------------
// Exponential Smoothing (Holt's single exponential, alpha-parameterised)
// ---------------------------------------------------------------------------

export function exponentialSmoothing(data: DataPoint[], alpha = 0.3): DataPoint[] {
  if (data.length === 0) return []

  const smoothed: DataPoint[] = []
  let s = data[0].value

  for (const point of data) {
    s = alpha * point.value + (1 - alpha) * s
    smoothed.push({ date: point.date, value: Math.round(s * 100) / 100 })
  }
  return smoothed
}

// ---------------------------------------------------------------------------
// Forecast — extend time series N steps ahead using last EMA slope
// ---------------------------------------------------------------------------

export function forecast(data: DataPoint[], steps = 7, alpha = 0.3): ForecastPoint[] {
  if (data.length < 2) return []

  const smoothed = exponentialSmoothing(data, alpha)
  const lastSmoothed = smoothed[smoothed.length - 1].value
  const prevSmoothed = smoothed[smoothed.length - 2].value
  const slope = lastSmoothed - prevSmoothed

  // Compute residual std dev for confidence interval
  const residuals = data.map((p, i) => p.value - (smoothed[i]?.value ?? p.value))
  const meanResidual = residuals.reduce((s, r) => s + r, 0) / residuals.length
  const variance = residuals.reduce((s, r) => s + Math.pow(r - meanResidual, 2), 0) / residuals.length
  const stdDev = Math.sqrt(variance)

  const lastDate = new Date(data[data.length - 1].date)
  const result: ForecastPoint[] = []

  for (let i = 1; i <= steps; i++) {
    const d = new Date(lastDate)
    d.setDate(d.getDate() + i)
    const projected = Math.max(0, lastSmoothed + slope * i)
    result.push({
      date: d.toISOString().slice(0, 10),
      value: Math.round(projected * 100) / 100,
      forecast: true,
      lower: Math.max(0, Math.round((projected - 2 * stdDev) * 100) / 100),
      upper: Math.round((projected + 2 * stdDev) * 100) / 100,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Anomaly detection — flag points > 2 standard deviations from rolling mean
// ---------------------------------------------------------------------------

export function detectAnomalies(data: DataPoint[], window = 14): AnomalyPoint[] {
  if (data.length < window) {
    // Not enough data — return raw with no anomalies
    return data.map((p) => ({ ...p, isAnomaly: false, zScore: 0, deviation: 0 }))
  }

  return data.map((point, i) => {
    const start = Math.max(0, i - window)
    const slice = data.slice(start, i + 1)
    const mean = slice.reduce((s, p) => s + p.value, 0) / slice.length
    const variance = slice.reduce((s, p) => s + Math.pow(p.value - mean, 2), 0) / slice.length
    const std = Math.sqrt(variance)
    const zScore = std > 0 ? (point.value - mean) / std : 0
    const deviation = point.value - mean

    return {
      ...point,
      isAnomaly: Math.abs(zScore) > 2,
      zScore: Math.round(zScore * 100) / 100,
      deviation: Math.round(deviation * 100) / 100,
    }
  })
}

// ---------------------------------------------------------------------------
// Full trend analysis — combine all into a single result
// ---------------------------------------------------------------------------

export function analyseTrend(raw: DataPoint[], forecastDays = 7): TrendSeries {
  const sma7pts = sma(raw, 7)
  const sma30pts = sma(raw, 30)
  const forecastPts = forecast(raw, forecastDays)
  const anomalyPts = detectAnomalies(raw)

  // Trend direction: compare last 7-day average vs prior 7-day average
  const last7 = raw.slice(-7)
  const prev7 = raw.slice(-14, -7)
  const last7Avg = last7.length ? last7.reduce((s, p) => s + p.value, 0) / last7.length : 0
  const prev7Avg = prev7.length ? prev7.reduce((s, p) => s + p.value, 0) / prev7.length : last7Avg

  const trendPct = prev7Avg > 0 ? ((last7Avg - prev7Avg) / prev7Avg) * 100 : 0
  const trend: 'up' | 'down' | 'flat' =
    trendPct > 5 ? 'up' : trendPct < -5 ? 'down' : 'flat'

  return {
    raw,
    sma7: sma7pts,
    sma30: sma30pts,
    forecast: forecastPts,
    anomalies: anomalyPts,
    trend,
    trendPct: Math.round(trendPct * 10) / 10,
  }
}
