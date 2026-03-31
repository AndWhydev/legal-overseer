/**
 * Twenty CRM API client — thin wrapper over the Twenty REST API.
 * All CRM data (companies, people, opportunities) flows through here.
 *
 * Auth: Bearer token using a long-lived API key stored in TWENTY_API_KEY env var.
 * Base URL: TWENTY_API_URL env var (defaults to https://bitbit-crm.fly.dev).
 */

const BASE_URL = process.env.TWENTY_API_URL ?? 'https://bitbit-crm.fly.dev'
const API_KEY = process.env.TWENTY_API_KEY ?? ''

export interface TwentyPageInfo {
  startCursor: string | null
  endCursor: string | null
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface TwentyListResponse<T> {
  data: Record<string, T[]>
  totalCount: number
  pageInfo: TwentyPageInfo
}

export interface TwentyLink {
  primaryLinkLabel: string
  primaryLinkUrl: string
  secondaryLinks: { label: string; url: string }[]
}

export interface TwentyAddress {
  addressStreet1: string
  addressStreet2: string
  addressCity: string
  addressPostcode: string
  addressState: string
  addressCountry: string
  addressLat: number | null
  addressLng: number | null
}

export interface TwentyCurrency {
  amountMicros: number | null
  currencyCode: string | null
}

export interface TwentyCreatedBy {
  source: string
  workspaceMemberId: string | null
  name: string
  context: Record<string, unknown>
}

// ---- Company ----

export interface TwentyCompany {
  id: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  name: string
  domainName: TwentyLink
  address: TwentyAddress
  employees: number | null
  linkedinLink: TwentyLink
  xLink: TwentyLink
  annualRecurringRevenue: TwentyCurrency
  idealCustomerProfile: boolean
  position: number
  createdBy: TwentyCreatedBy
  accountOwnerId: string | null
}

export interface CreateCompanyInput {
  name: string
  domainName?: { primaryLinkUrl: string; primaryLinkLabel?: string }
  address?: Partial<TwentyAddress>
  employees?: number
  linkedinLink?: { primaryLinkUrl: string; primaryLinkLabel?: string }
  idealCustomerProfile?: boolean
}

// ---- Person ----

export interface TwentyPerson {
  id: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  name: { firstName: string; lastName: string }
  emails: { primaryEmail: string; additionalEmails: string[] }
  phones: { primaryPhoneNumber: string; additionalPhoneNumbers: string[] }
  linkedinLink: TwentyLink
  jobTitle: string
  city: string
  avatarUrl: string
  companyId: string | null
  position: number
  createdBy: TwentyCreatedBy
}

// ---- Opportunity ----

export interface TwentyOpportunity {
  id: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  name: string
  amount: TwentyCurrency
  stage: string
  closeDate: string | null
  probability: string
  pointOfContactId: string | null
  companyId: string | null
  position: number
  createdBy: TwentyCreatedBy
}

// ---- Query options ----

export interface TwentyQueryOptions {
  limit?: number
  startingAfter?: string
  endingBefore?: string
  filter?: Record<string, unknown>
  orderBy?: string
}

function buildQueryString(opts?: TwentyQueryOptions): string {
  if (!opts) return ''
  const params = new URLSearchParams()
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.startingAfter) params.set('starting_after', opts.startingAfter)
  if (opts.endingBefore) params.set('ending_before', opts.endingBefore)
  if (opts.filter) params.set('filter', JSON.stringify(opts.filter))
  if (opts.orderBy) params.set('order_by', opts.orderBy)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

// ---- Core fetch ----

class TwentyApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Twenty API ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
    this.name = 'TwentyApiError'
  }
}

async function twentyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_KEY) throw new Error('TWENTY_API_KEY not configured')

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      ...init?.headers,
    },
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) throw new TwentyApiError(res.status, body)
  return body as T
}

// ---- Companies ----

export async function listCompanies(opts?: TwentyQueryOptions) {
  return twentyFetch<TwentyListResponse<TwentyCompany>>(
    `/rest/companies${buildQueryString(opts)}`,
  )
}

export async function getCompany(id: string) {
  return twentyFetch<{ data: { company: TwentyCompany } }>(`/rest/companies/${id}`)
}

export async function createCompany(input: CreateCompanyInput) {
  return twentyFetch<{ data: { createCompany: TwentyCompany } }>('/rest/companies', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateCompany(id: string, input: Partial<CreateCompanyInput>) {
  return twentyFetch<{ data: { updateCompany: TwentyCompany } }>(`/rest/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteCompany(id: string) {
  return twentyFetch<{ data: { deleteCompany: { id: string } } }>(`/rest/companies/${id}`, {
    method: 'DELETE',
  })
}

// ---- People ----

export async function listPeople(opts?: TwentyQueryOptions) {
  return twentyFetch<TwentyListResponse<TwentyPerson>>(
    `/rest/people${buildQueryString(opts)}`,
  )
}

export async function getPerson(id: string) {
  return twentyFetch<{ data: { person: TwentyPerson } }>(`/rest/people/${id}`)
}

export async function createPerson(input: Record<string, unknown>) {
  return twentyFetch<{ data: { createPerson: TwentyPerson } }>('/rest/people', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ---- Opportunities ----

export async function listOpportunities(opts?: TwentyQueryOptions) {
  return twentyFetch<TwentyListResponse<TwentyOpportunity>>(
    `/rest/opportunities${buildQueryString(opts)}`,
  )
}

export async function getOpportunity(id: string) {
  return twentyFetch<{ data: { opportunity: TwentyOpportunity } }>(`/rest/opportunities/${id}`)
}

// ---- Health check ----

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/healthz`, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch {
    return false
  }
}

export { TwentyApiError }
