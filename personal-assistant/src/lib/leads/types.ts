export type LeadStatus = 'new' | 'qualified' | 'booked' | 'converted' | 'lost'
export type LeadScore = 'hot' | 'warm' | 'cold'
export type DiscoverySource = 'inbound' | 'pcc_discovery'
export type DealRotLevel = 'fresh' | 'aging' | 'stale' | 'critical'
export type SpeedToLeadLevel = 'fast' | 'ok' | 'slow'
export type SmartView = 'all' | 'hot_followup' | 'stale' | 'high_value' | 'pcc_discoveries'
export type LeadViewMode = 'kanban' | 'list'

export interface WebsiteSignals {
  url?: string
  reachable?: boolean
  cms?: string | null
  has_google_analytics?: boolean | null
  has_facebook_pixel?: boolean | null
  has_google_ads?: boolean | null
  has_booking_system?: boolean | null
  load_time_ms?: number | null
  title?: string | null
  meta_description?: string | null
  emails?: string[]
  phones?: string[]
  social_links?: string[]
}

export interface SerpPresence {
  found_in_ads?: boolean
  ad_position?: number | null
  found_in_maps?: boolean
  maps_position?: number | null
  found_in_organic?: boolean
  organic_position?: number | null
}

export interface ScoreBreakdown {
  total: number
  components: Array<{ factor: string; points: number; note?: string }>
}

export interface EnhancedLeadData {
  id: string
  status: LeadStatus
  score: LeadScore
  notes: string | null
  estimated_value: number | null
  timeline_days: number | null
  service_interest: string[] | null
  source_channel: string
  source_detail: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string

  // Discovery
  discovery_source: DiscoverySource | null
  prospect_name: string | null
  prospect_website: string | null
  prospect_domain: string | null
  prospect_phone: string | null
  prospect_address: string | null
  prospect_emails: string[] | null
  prospect_rating: number | null
  prospect_review_count: number | null

  // PCC Scoring
  fit_score: number | null
  opportunity_score: number | null
  priority_score: number | null
  fit_breakdown: ScoreBreakdown | null
  opportunity_breakdown: ScoreBreakdown | null

  // Outreach Intelligence
  opportunity_notes: string | null
  outreach_angle: string | null
  priority_services: string[] | null

  // Enrichment Signals
  website_signals: WebsiteSignals | null
  serp_presence: SerpPresence | null

  // Pipeline Management
  last_activity_at: string | null
  first_ack_at: string | null
  next_action: string | null
  next_action_at: string | null
}

export interface PipelineAnalytics {
  totalValue: number
  conversionRate: number
  avgDaysInStage: number
  avgSpeedToLeadMinutes: number | null
  staleCount: number
  leadsBySource: Record<string, number>
  leadsByScore: Record<LeadScore, number>
}

export interface LeadFilter {
  score?: LeadScore | 'all'
  source?: string | 'all'
  staleness?: DealRotLevel | 'all'
  minValue?: number
  maxValue?: number
  smartView?: SmartView
}

export interface ProspectResult {
  name: string
  domain: string | null
  website: string | null
  phone: string | null
  address: string | null
  emails: string[]
  rating: number | null
  review_count: number | null
  fit_score: number
  opportunity_score: number
  priority_score: number
  fit_breakdown: ScoreBreakdown
  opportunity_breakdown: ScoreBreakdown
  opportunity_notes: string
  outreach_angle: string
  priority_services: string[]
  website_signals: WebsiteSignals | null
  serp_presence: SerpPresence
  imported?: boolean
}

export interface DiscoveryJob {
  id: string
  status: 'searching' | 'enriching' | 'scoring' | 'complete' | 'error'
  progress: number
  message: string
  results: ProspectResult[]
  error?: string
}
