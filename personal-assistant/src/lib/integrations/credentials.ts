import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const ALGORITHM = 'aes-256-gcm'
const SALT = 'bitbit-integration-salt' // In production, use a random salt from env
const ENCODING = 'utf8'

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
    throw new Error(`Failed to store credential: ${error.message}`)
  }
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
    return null
  }

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
    throw new Error(`Failed to delete credential: ${error.message}`)
  }
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
    throw new Error(`Failed to fetch integrations: ${error.message}`)
  }

  return data || []
}
