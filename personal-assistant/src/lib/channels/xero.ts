import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential } from '@/lib/integrations/credentials'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface XeroTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export interface XeroCredentials {
  client_id: string
  client_secret: string
  access_token?: string
  refresh_token?: string
  token_expires_at?: string
  tenant_id?: string
}

export interface XeroConfig {
  tenantId?: string
  maxResults?: number
  filters?: Record<string, unknown>
}

export interface XeroError {
  error: string
  details?: string
}

export interface XeroTenant {
  id: string
  name: string
  shortCode: string
  createdDateUtc: string
  status: string
}

export interface XeroInvoice {
  InvoiceID: string
  InvoiceNumber: string
  Status: string
  Type: string
  Contact: { Name: string; ContactID: string }
  LineItems?: Array<{ Description: string; Quantity: number; UnitAmount: number }>
  Total: number
  AmountDue: number
  DueDate?: string
  InvoiceDate: string
}

export interface XeroCreateInvoiceData {
  Type: string
  Contact: { Name: string }
  LineItems: Array<{
    Description: string
    Quantity: number
    UnitAmount: number
    AccountCode: string
  }>
  DueDate?: string
  Reference?: string
}

export interface XeroUpdateInvoiceData {
  Status?: string
  DueDate?: string
  Reference?: string
}

export interface XeroContact {
  ContactID: string
  Name: string
  EmailAddress?: string
  FirstName?: string
  LastName?: string
  Phones?: Array<{ PhoneType: string; PhoneNumber: string }>
  Addresses?: Array<{ AddressType: string; AddressLine1: string }>
  ContactStatus: string
}

export interface XeroCreateContactData {
  Name: string
  EmailAddress?: string
  FirstName?: string
  LastName?: string
  PhoneNumber?: string
}

export interface XeroPayment {
  PaymentID: string
  Invoice: { InvoiceID: string; InvoiceNumber: string }
  Account: { Code: string; Name: string }
  Amount: number
  PaymentDate: string
  Reference?: string
  Status: string
}

export interface XeroCreatePaymentData {
  Invoice: { InvoiceID: string }
  Account: { Code: string }
  Amount: number
  PaymentDate: string
  Reference?: string
}

export interface XeroBankTransaction {
  BankTransactionID: string
  Type: string
  Contact: { Name: string; ContactID: string }
  LineItems?: Array<{ Description: string; Quantity: number; UnitAmount: number }>
  Total: number
  Status: string
  Date: string
  Reference?: string
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function isXeroTokenExpired(expiresAt?: string): boolean {
  if (!expiresAt) return true
  const bufferMs = 5 * 60 * 1000 // 5-minute buffer
  return new Date(expiresAt).getTime() - bufferMs <= Date.now()
}

/**
 * Refresh Xero OAuth2 token using refresh_token grant.
 * Persists new tokens back to Supabase channel_configs.
 */
export async function refreshXeroToken(
  client: SupabaseClient,
  orgId: string,
  creds: XeroCredentials,
): Promise<string | null> {
  // Return existing token if not expired
  if (creds.access_token && !isXeroTokenExpired(creds.token_expires_at)) {
    return creds.access_token
  }

  if (!creds.refresh_token) return null

  try {
    const url = 'https://identity.xero.com/connect/token'
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
    })

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })

    if (!res.ok) {
      console.warn(`[xero] Token refresh failed with status ${res.status}`)
      return null
    }

    const data = (await res.json()) as XeroTokenResponse

    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

    // Persist refreshed tokens
    await client
      .from('channel_configs')
      .update({
        credentials: {
          ...creds,
          access_token: data.access_token,
          refresh_token: data.refresh_token || creds.refresh_token,
          token_expires_at: expiresAt,
        },
      })
      .eq('org_id', orgId)
      .eq('channel_type', 'xero')

    return data.access_token
  } catch (err) {
    console.warn('[xero] Token refresh error:', err)
    return null
  }
}

/**
 * Resolve a valid access token, refreshing if expired.
 */
async function resolveAccessToken(
  creds: XeroCredentials,
  client?: SupabaseClient,
  orgId?: string,
): Promise<string | null> {
  if (creds.access_token && !isXeroTokenExpired(creds.token_expires_at)) {
    return creds.access_token
  }

  if (client && orgId) {
    const token = await refreshXeroToken(client, orgId, creds)
    return token
  }

  return creds.access_token || null
}

/**
 * Helper to resolve token and tenant ID from credentials.
 */
async function resolveXeroAuth(
  client: SupabaseClient,
  orgId: string,
  tenantId?: string,
): Promise<{ token: string | null; tenantId: string | null }> {
  const creds = (await getOrgCredential(client, orgId, 'xero')) as XeroCredentials | null
  if (!creds) {
    return { token: null, tenantId: null }
  }

  const token = await resolveAccessToken(creds, client, orgId)
  return {
    token,
    tenantId: tenantId || creds.tenant_id || null,
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const XERO_BASE = 'https://api.xero.com/api.xro/2.0'

async function xeroFetch<T>(
  token: string,
  tenantId: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${XERO_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Xero API ${res.status}: ${text}`)
  }

  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Public DI functions (SupabaseClient first param)
// ---------------------------------------------------------------------------

/**
 * Fetch list of Xero tenants (organizations) the authenticated user has access to.
 */
export async function getXeroTenants(
  client: SupabaseClient,
  orgId: string,
): Promise<XeroTenant[] | XeroError> {
  try {
    const creds = (await getOrgCredential(client, orgId, 'xero')) as XeroCredentials | null
    if (!creds || !creds.access_token) {
      return { error: 'No Xero credentials configured' }
    }

    const token = await resolveAccessToken(creds, client, orgId)
    if (!token) {
      return { error: 'Failed to resolve Xero access token' }
    }

    // Using the connections endpoint which doesn't require tenant-id
    const res = await fetch('https://api.xero.com/connections', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      const text = await res.text()
      return { error: `Failed to fetch tenants: ${res.status}`, details: text }
    }

    const tenants = (await res.json()) as XeroTenant[]
    return tenants
  } catch (err) {
    return { error: 'Failed to fetch Xero tenants', details: String(err) }
  }
}

/**
 * List invoices from Xero.
 */
export async function listXeroInvoices(
  client: SupabaseClient,
  orgId: string,
  config: XeroConfig = {},
): Promise<XeroInvoice[] | XeroError> {
  try {
    const { token, tenantId } = await resolveXeroAuth(client, orgId, config.tenantId)
    if (!token || !tenantId) {
      return { error: 'No valid Xero credentials or tenant configured' }
    }

    const maxResults = config.maxResults || 100
    let where = ''
    if (config.filters) {
      const filterEntries = Object.entries(config.filters)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' AND ')
      where = `?where=${encodeURIComponent(filterEntries)}`
    }

    const data = await xeroFetch<{ Invoices: XeroInvoice[] }>(
      token,
      tenantId,
      `/Invoices${where}&pageSize=${maxResults}`,
    )
    return data.Invoices || []
  } catch (err) {
    return { error: 'Failed to fetch invoices', details: String(err) }
  }
}

/**
 * Create a new invoice in Xero.
 */
export async function createXeroInvoice(
  client: SupabaseClient,
  orgId: string,
  data: XeroCreateInvoiceData,
  tenantId?: string,
): Promise<XeroInvoice | XeroError> {
  try {
    const { token, tenantId: resolvedTenantId } = await resolveXeroAuth(client, orgId, tenantId)
    if (!token || !resolvedTenantId) {
      return { error: 'No valid Xero credentials or tenant configured' }
    }

    const result = await xeroFetch<{ Invoices: XeroInvoice[] }>(token, resolvedTenantId, '/Invoices', {
      method: 'POST',
      body: JSON.stringify({ Invoices: [data] }),
    })

    return result.Invoices?.[0] || { error: 'No invoice returned from API' }
  } catch (err) {
    return { error: 'Failed to create invoice', details: String(err) }
  }
}

/**
 * Update an existing invoice in Xero.
 */
export async function updateXeroInvoice(
  client: SupabaseClient,
  orgId: string,
  invoiceId: string,
  data: XeroUpdateInvoiceData,
  tenantId?: string,
): Promise<XeroInvoice | XeroError> {
  try {
    const { token, tenantId: resolvedTenantId } = await resolveXeroAuth(client, orgId, tenantId)
    if (!token || !resolvedTenantId) {
      return { error: 'No valid Xero credentials or tenant configured' }
    }

    const result = await xeroFetch<{ Invoices: XeroInvoice[] }>(
      token,
      resolvedTenantId,
      `/Invoices/${invoiceId}`,
      {
        method: 'POST',
        body: JSON.stringify({ Invoices: [data] }),
      },
    )

    return result.Invoices?.[0] || { error: 'No invoice returned from API' }
  } catch (err) {
    return { error: 'Failed to update invoice', details: String(err) }
  }
}

/**
 * List contacts from Xero.
 */
export async function listXeroContacts(
  client: SupabaseClient,
  orgId: string,
  config: XeroConfig = {},
): Promise<XeroContact[] | XeroError> {
  try {
    const { token, tenantId } = await resolveXeroAuth(client, orgId, config.tenantId)
    if (!token || !tenantId) {
      return { error: 'No valid Xero credentials or tenant configured' }
    }

    const maxResults = config.maxResults || 100
    const data = await xeroFetch<{ Contacts: XeroContact[] }>(
      token,
      tenantId,
      `/Contacts?pageSize=${maxResults}`,
    )
    return data.Contacts || []
  } catch (err) {
    return { error: 'Failed to fetch contacts', details: String(err) }
  }
}

/**
 * Create a new contact in Xero.
 */
export async function createXeroContact(
  client: SupabaseClient,
  orgId: string,
  data: XeroCreateContactData,
  tenantId?: string,
): Promise<XeroContact | XeroError> {
  try {
    const { token, tenantId: resolvedTenantId } = await resolveXeroAuth(client, orgId, tenantId)
    if (!token || !resolvedTenantId) {
      return { error: 'No valid Xero credentials or tenant configured' }
    }

    const result = await xeroFetch<{ Contacts: XeroContact[] }>(token, resolvedTenantId, '/Contacts', {
      method: 'POST',
      body: JSON.stringify({ Contacts: [data] }),
    })

    return result.Contacts?.[0] || { error: 'No contact returned from API' }
  } catch (err) {
    return { error: 'Failed to create contact', details: String(err) }
  }
}

/**
 * List payments from Xero.
 */
export async function listXeroPayments(
  client: SupabaseClient,
  orgId: string,
  config: XeroConfig = {},
): Promise<XeroPayment[] | XeroError> {
  try {
    const { token, tenantId } = await resolveXeroAuth(client, orgId, config.tenantId)
    if (!token || !tenantId) {
      return { error: 'No valid Xero credentials or tenant configured' }
    }

    const maxResults = config.maxResults || 100
    const data = await xeroFetch<{ Payments: XeroPayment[] }>(
      token,
      tenantId,
      `/Payments?pageSize=${maxResults}`,
    )
    return data.Payments || []
  } catch (err) {
    return { error: 'Failed to fetch payments', details: String(err) }
  }
}

/**
 * Create a new payment in Xero.
 */
export async function createXeroPayment(
  client: SupabaseClient,
  orgId: string,
  data: XeroCreatePaymentData,
  tenantId?: string,
): Promise<XeroPayment | XeroError> {
  try {
    const { token, tenantId: resolvedTenantId } = await resolveXeroAuth(client, orgId, tenantId)
    if (!token || !resolvedTenantId) {
      return { error: 'No valid Xero credentials or tenant configured' }
    }

    const result = await xeroFetch<{ Payments: XeroPayment[] }>(token, resolvedTenantId, '/Payments', {
      method: 'POST',
      body: JSON.stringify({ Payments: [data] }),
    })

    return result.Payments?.[0] || { error: 'No payment returned from API' }
  } catch (err) {
    return { error: 'Failed to create payment', details: String(err) }
  }
}

/**
 * List bank transactions from Xero.
 */
export async function listXeroBankTransactions(
  client: SupabaseClient,
  orgId: string,
  config: XeroConfig = {},
): Promise<XeroBankTransaction[] | XeroError> {
  try {
    const { token, tenantId } = await resolveXeroAuth(client, orgId, config.tenantId)
    if (!token || !tenantId) {
      return { error: 'No valid Xero credentials or tenant configured' }
    }

    const maxResults = config.maxResults || 100
    const data = await xeroFetch<{ BankTransactions: XeroBankTransaction[] }>(
      token,
      tenantId,
      `/BankTransactions?pageSize=${maxResults}`,
    )
    return data.BankTransactions || []
  } catch (err) {
    return { error: 'Failed to fetch bank transactions', details: String(err) }
  }
}

// ---------------------------------------------------------------------------
// ChannelAdapter for synthesizer compatibility (env-var based)
// ---------------------------------------------------------------------------

/**
 * Xero channel adapter for accounting operations.
 * Minimal pull() implementation (Xero is primarily a CRUD API, not a message stream).
 * API: https://api.xero.com/api.xro/2.0
 */
export const xeroAdapter: ChannelAdapter = {
  type: 'xero',
  name: 'Xero',
  description: 'Sync accounting data from Xero (invoices, contacts, payments)',
  icon: 'BarChart3',

  async pull(_config, _since) {
    // Xero is not a message-based channel; accounting data is accessed via specific CRUD operations.
    // Return empty array for synthesizer compatibility.
    return []
  },

  async isAvailable() {
    // Xero requires client credentials configured in environment or Supabase.
    // For now, check environment variables as a basic test.
    return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET)
  },
}
