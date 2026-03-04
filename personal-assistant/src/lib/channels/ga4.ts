import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential } from '@/lib/integrations/credentials'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GA4Credentials {
  access_token: string
  refresh_token?: string
  property_id: string
}

export interface GA4Error {
  error: string
  details?: string
}

export interface GA4Dimension {
  name: string
}

export interface GA4Metric {
  name: string
}

export interface GA4Row {
  dimensionValues?: Array<{ value: string }>
  metricValues?: Array<{ value: string }>
}

export interface GA4Report {
  rows?: GA4Row[]
  rowCount?: number
  dimensionHeaders?: Array<{ name: string }>
  metricHeaders?: Array<{ name: string; type?: string }>
  metadata?: Record<string, unknown>
}

export interface GA4RunReportRequest {
  dimensions: GA4Dimension[]
  metrics: GA4Metric[]
  dateRanges: Array<{ startDate: string; endDate: string }>
  limit?: string
}

export type GA4RunReportResponse = GA4Report

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const GA4_BASE = 'https://analyticsdata.googleapis.com/v1beta'

async function ga4Fetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GA4_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GA4 API ${res.status}: ${text}`)
  }

  return (await res.json()) as T
}

async function resolveToken(
  client: SupabaseClient,
  orgId: string,
): Promise<GA4Credentials | null> {
  return (await getOrgCredential(client, orgId, 'ga4')) as GA4Credentials | null
}

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0]
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// ---------------------------------------------------------------------------
// Public DI functions (SupabaseClient first param)
// ---------------------------------------------------------------------------

export async function runGA4Report(
  client: SupabaseClient,
  orgId: string,
  dimensions: string[],
  metrics: string[],
  dateRange: { startDate: string; endDate: string },
): Promise<GA4RunReportResponse | GA4Error> {
  try {
    const creds = await resolveToken(client, orgId)
    if (!creds) return { error: 'No GA4 credentials configured' }

    const body: GA4RunReportRequest = {
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
    }

    return await ga4Fetch<GA4RunReportResponse>(
      creds.access_token,
      `/properties/${creds.property_id}:runReport`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    )
  } catch (err) {
    return { error: 'Failed to run GA4 report', details: String(err) }
  }
}

export async function fetchGA4RealtimeReport(
  client: SupabaseClient,
  orgId: string,
): Promise<GA4RunReportResponse | GA4Error> {
  try {
    const creds = await resolveToken(client, orgId)
    if (!creds) return { error: 'No GA4 credentials configured' }

    return await ga4Fetch<GA4RunReportResponse>(
      creds.access_token,
      `/properties/${creds.property_id}:runRealtimeReport`,
      {
        method: 'POST',
        body: JSON.stringify({
          dimensions: [{ name: 'country' }],
          metrics: [{ name: 'activeUsers' }],
        }),
      },
    )
  } catch (err) {
    return { error: 'Failed to fetch realtime report', details: String(err) }
  }
}

export async function fetchGA4TopPages(
  client: SupabaseClient,
  orgId: string,
  dateRange: { startDate: string; endDate: string },
): Promise<GA4RunReportResponse | GA4Error> {
  return runGA4Report(
    client,
    orgId,
    ['pagePath'],
    ['screenPageViews', 'sessions'],
    dateRange,
  )
}

export async function fetchGA4TrafficSources(
  client: SupabaseClient,
  orgId: string,
  dateRange: { startDate: string; endDate: string },
): Promise<GA4RunReportResponse | GA4Error> {
  return runGA4Report(
    client,
    orgId,
    ['sessionSource', 'sessionMedium'],
    ['sessions', 'totalUsers'],
    dateRange,
  )
}

// ---------------------------------------------------------------------------
// ChannelAdapter for synthesizer compatibility (env-var based)
// ---------------------------------------------------------------------------

export const ga4Adapter: ChannelAdapter = {
  type: 'ga4',
  name: 'Google Analytics 4',
  description: 'Summarize GA4 reports as channel messages',
  icon: 'BarChart3',

  async pull(_config, since) {
    const token = process.env.GA4_ACCESS_TOKEN
    const propertyId = process.env.GA4_PROPERTY_ID
    if (!token || !propertyId) return []

    const start = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const dateRange = {
      startDate: formatDateISO(start),
      endDate: formatDateISO(new Date()),
    }

    try {
      const report = await ga4Fetch<GA4RunReportResponse>(token, `/properties/${propertyId}:runReport`, {
        method: 'POST',
        body: JSON.stringify({
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
          dateRanges: [dateRange],
          limit: '25',
        } satisfies GA4RunReportRequest),
      })

      const rows = report.rows || []
      return rows.map((row, index): ChannelMessage => {
        const pagePath = row.dimensionValues?.[0]?.value || '(unknown page)'
        const views = toNumber(row.metricValues?.[0]?.value)
        const sessions = toNumber(row.metricValues?.[1]?.value)
        const priority: ChannelMessage['priority'] =
          sessions >= 1000 ? 'high' : sessions >= 250 ? 'medium' : 'low'

        return {
          id: `ga4-${index}-${dateRange.endDate}`,
          channel: 'ga4',
          externalId: `${pagePath}:${index}:${dateRange.endDate}`,
          sender: 'Google Analytics 4',
          subject: `Top page: ${pagePath}`,
          body: `${views} views and ${sessions} sessions from ${dateRange.startDate} to ${dateRange.endDate}.`,
          receivedAt: new Date(),
          isActionable: false,
          priority,
          metadata: {
            pagePath,
            views,
            sessions,
            dateRange,
          },
        }
      })
    } catch (err) {
      console.error('[ga4] pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(process.env.GA4_ACCESS_TOKEN && process.env.GA4_PROPERTY_ID)
  },
}
