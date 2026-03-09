import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logAuditEvent } from '@/lib/audit/logger'

const ALGORITHM = 'aes-256-gcm'
const SALT = 'bitbit-integration-salt' // In production, use a random salt from env
const ENCODING = 'utf8'

type PostgrestLikeError = {
  message?: string
  details?: string
  hint?: string
} | null

/**
 * Get the encryption key from environment variables or generate one
 */
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.CREDENTIALS_KEY
  if (!keyEnv) {
    throw new Error('CREDENTIALS_KEY environment variable is not set')
  }

  // Use scrypt to derive a consistent key from the environment variable
  return scryptSync(keyEnv, SALT, 32)
}

function getCredentialChannelType(provider: string): string {
  switch (provider) {
    case 'google-calendar':
      return 'calendar'
    case 'google-analytics':
    case 'ga4':
      return 'gsc'
    default:
      return provider
  }
}

function isMissingTableError(error: PostgrestLikeError, tableName: string): boolean {
  if (!error) return false

  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    message.includes(`could not find the table 'public.${tableName}' in the schema cache`) ||
    message.includes(`relation "${tableName}" does not exist`) ||
    message.includes(`relation public.${tableName} does not exist`)
  )
}

async function upsertCredentialIntoChannelConnections(
  supabase: SupabaseClient,
  orgId: string,
  provider: string,
  encrypted: string,
): Promise<void> {
  const channelType = getCredentialChannelType(provider)
  const { data: existing, error: existingError } = await supabase
    .from('channel_connections')
    .select('config, last_sync, message_count')
    .eq('org_id', orgId)
    .eq('channel_type', channelType)
    .maybeSingle<{
      config?: Record<string, unknown> | null
      last_sync?: string | null
      message_count?: number | null
    }>()

  if (existingError) {
    throw new Error(`Failed to load channel connection fallback: ${existingError.message}`)
  }

  const existingConfig =
    existing?.config && typeof existing.config === 'object' && !Array.isArray(existing.config)
      ? existing.config
      : {}

  const { error } = await supabase.from('channel_connections').upsert(
    {
      org_id: orgId,
      channel_type: channelType,
      status: 'connected',
      last_sync: existing?.last_sync ?? null,
      message_count: existing?.message_count ?? 0,
      config: {
        ...existingConfig,
        credential_provider: provider,
        credentials_encrypted: encrypted,
      },
    },
    {
      onConflict: 'org_id,channel_type',
    }
  )

  if (error) {
    throw new Error(`Failed to store credential fallback: ${error.message}`)
  }
}

async function getCredentialFromChannelConnections(
  supabase: SupabaseClient,
  orgId: string,
  provider: string,
): Promise<Record<string, unknown> | null> {
  const channelType = getCredentialChannelType(provider)
  const { data, error } = await supabase
    .from('channel_connections')
    .select('config')
    .eq('org_id', orgId)
    .eq('channel_type', channelType)
    .maybeSingle<{ config?: Record<string, unknown> | null }>()

  if (error || !data?.config) {
    return null
  }

  const encrypted =
    typeof data.config.credentials_encrypted === 'string'
      ? data.config.credentials_encrypted
      : null

  if (!encrypted) {
    return null
  }

  try {
    const decrypted = decryptCredential(encrypted)
    return JSON.parse(decrypted) as Record<string, unknown>
  } catch {
    const decrypted = decryptCredential(encrypted)
    return { token: decrypted } as Record<string, unknown>
  }
}

async function deleteCredentialFromChannelConnections(
  supabase: SupabaseClient,
  orgId: string,
  provider: string,
): Promise<void> {
  const channelType = getCredentialChannelType(provider)
  const { data: existing, error: existingError } = await supabase
    .from('channel_connections')
    .select('config')
    .eq('org_id', orgId)
    .eq('channel_type', channelType)
    .maybeSingle<{ config?: Record<string, unknown> | null }>()

  if (existingError) {
    throw new Error(`Failed to load credential fallback: ${existingError.message}`)
  }

  const existingConfig =
    existing?.config && typeof existing.config === 'object' && !Array.isArray(existing.config)
      ? existing.config
      : {}

  const { credentials_encrypted: _encrypted, credential_provider: _provider, ...rest } = existingConfig

  const { error } = await supabase
    .from('channel_connections')
    .update({
      config: rest,
    })
    .eq('org_id', orgId)
    .eq('channel_type', channelType)

  if (error) {
    throw new Error(`Failed to clear credential fallback: ${error.message}`)
  }
}

async function getIntegrationsFromChannelConnections(
  supabase: SupabaseClient,
  orgId: string,
): Promise<
  Array<{
    id: string
    provider: string
    status: string
    connected_at: string | null
    metadata: Record<string, unknown>
  }>
> {
  const { data, error } = await supabase
    .from('channel_connections')
    .select('id, channel_type, status, created_at, config')
    .eq('org_id', orgId)

  if (error) {
    throw new Error(`Failed to fetch integrations fallback: ${error.message}`)
  }

  return (data ?? []).map((row: {
    id: string
    channel_type: string
    status?: string | null
    created_at?: string | null
    config?: Record<string, unknown> | null
  }) => ({
    id: row.id,
    provider: row.channel_type === 'calendar' ? 'google-calendar' : row.channel_type,
    status: row.status || 'disconnected',
    connected_at: row.created_at || null,
    metadata:
      row.config && typeof row.config === 'object' && !Array.isArray(row.config)
        ? row.config
        : {},
  }))
}

/**
 * Encrypt plaintext credentials
 * Returns a base64 encoded string in format: iv:authTag:ciphertext
 */
export function encryptCredential(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, ENCODING, 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // Format: base64(iv):base64(authTag):base64(ciphertext)
  const result = [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted,
  ].join(':')

  return result
}

/**
 * Decrypt encrypted credentials
 * Expects format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function decryptCredential(encrypted: string): string {
  const key = getEncryptionKey()
  const parts = encrypted.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format')
  }

  const iv = Buffer.from(parts[0], 'base64')
  const authTag = Buffer.from(parts[1], 'base64')
  const ciphertext = parts[2]

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'hex', ENCODING)
  decrypted += decipher.final(ENCODING)

  return decrypted
}

/**
 * Store organization credentials in the database
 */
export async function storeOrgCredential(
  supabase: SupabaseClient,
  orgId: string,
  provider: string,
  credentials: string | Record<string, unknown>,
  userId: string
): Promise<void> {
  const credentialString = typeof credentials === 'string'
    ? credentials
    : JSON.stringify(credentials)

  const encrypted = encryptCredential(credentialString)

  const { error } = await supabase.from('org_integrations').upsert(
    {
      org_id: orgId,
      provider,
      credentials_encrypted: encrypted,
      status: 'connected',
      connected_at: new Date().toISOString(),
      connected_by: userId,
      metadata: {
        connected_at: new Date().toISOString(),
      },
    },
    {
      onConflict: 'org_id,provider',
    }
  )

  if (error) {
    if (isMissingTableError(error, 'org_integrations')) {
      await upsertCredentialIntoChannelConnections(supabase, orgId, provider, encrypted)
    } else {
      throw new Error(`Failed to store credential: ${error.message}`)
    }
  }

  await logAuditEvent(supabase, {
    orgId,
    actorType: 'user',
    actorId: userId,
    action: 'updated',
    entityType: 'credential',
    entityId: provider,
    metadata: { operation: 'store', provider },
  })
}

/**
 * Retrieve and decrypt organization credentials
 */
export async function getOrgCredential(
  supabase: SupabaseClient,
  orgId: string,
  provider: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('org_integrations')
    .select('credentials_encrypted')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .single()

  if (error || !data) {
    if (isMissingTableError(error, 'org_integrations')) {
      return await getCredentialFromChannelConnections(supabase, orgId, provider)
    }
    return null
  }

  await logAuditEvent(supabase, {
    orgId,
    actorType: 'system',
    actorId: 'credential-reader',
    action: 'executed',
    entityType: 'credential',
    entityId: provider,
    metadata: { operation: 'read', provider },
  })

  try {
    const decrypted = decryptCredential(data.credentials_encrypted)
    return JSON.parse(decrypted) as Record<string, unknown>
  } catch {
    // If it's not JSON, return as plain string
    const decrypted = decryptCredential(data.credentials_encrypted)
    return { token: decrypted } as unknown as Record<string, unknown>
  }
}

/**
 * Store encrypted credentials in channel_configs for a specific channel.
 * Used by channel adapters (Gmail, Outlook, etc.) for OAuth token persistence.
 */
export async function storeChannelCredential(
  supabase: SupabaseClient,
  orgId: string,
  channelType: string,
  credentials: Record<string, unknown>,
): Promise<void> {
  const encrypted = encryptCredential(JSON.stringify(credentials))

  const { error } = await supabase
    .from('channel_configs')
    .update({ credentials_encrypted: encrypted })
    .eq('org_id', orgId)
    .eq('channel_type', channelType)

  if (error) {
    throw new Error(`Failed to store channel credential: ${error.message}`)
  }
}

/**
 * Retrieve and decrypt credentials from channel_configs.
 */
export async function getChannelCredential(
  supabase: SupabaseClient,
  orgId: string,
  channelType: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('channel_configs')
    .select('credentials_encrypted')
    .eq('org_id', orgId)
    .eq('channel_type', channelType)
    .single()

  if (error || !data?.credentials_encrypted) {
    return null
  }

  try {
    const decrypted = decryptCredential(data.credentials_encrypted)
    return JSON.parse(decrypted) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Delete organization credentials
 */
export async function deleteOrgCredential(
  supabase: SupabaseClient,
  orgId: string,
  provider: string
): Promise<void> {
  const { error } = await supabase
    .from('org_integrations')
    .delete()
    .eq('org_id', orgId)
    .eq('provider', provider)

  if (error) {
    if (isMissingTableError(error, 'org_integrations')) {
      await deleteCredentialFromChannelConnections(supabase, orgId, provider)
    } else {
      throw new Error(`Failed to delete credential: ${error.message}`)
    }
  }

  await logAuditEvent(supabase, {
    orgId,
    actorType: 'user',
    actorId: 'credential-manager',
    action: 'deleted',
    entityType: 'credential',
    entityId: provider,
    metadata: { operation: 'delete', provider },
  })
}

/**
 * Get all integrations for an organization (without credentials)
 */
export async function getOrgIntegrations(
  supabase: SupabaseClient,
  orgId: string
): Promise<
  Array<{
    id: string
    provider: string
    status: string
    connected_at: string | null
    metadata: Record<string, unknown>
  }>
> {
  const { data, error } = await supabase
    .from('org_integrations')
    .select('id, provider, status, connected_at, metadata')
    .eq('org_id', orgId)

  if (error) {
    if (isMissingTableError(error, 'org_integrations')) {
      return await getIntegrationsFromChannelConnections(supabase, orgId)
    }
    throw new Error(`Failed to fetch integrations: ${error.message}`)
  }

  return data || []
}
