import { beforeEach, describe, expect, it, vi } from 'vitest'

const { logAuditEventMock } = vi.hoisted(() => ({
  logAuditEventMock: vi.fn(),
}))

vi.mock('@/lib/audit/logger', () => ({
  logAuditEvent: logAuditEventMock,
}))

import {
  encryptCredential,
  getOrgCredential,
  storeOrgCredential,
} from './credentials'

function createSupabaseMock({
  orgIntegrationsUpsertError = null,
  orgIntegrationsSelectError = null,
  channelConnectionConfig = null,
}: {
  orgIntegrationsUpsertError?: { message: string } | null
  orgIntegrationsSelectError?: { message: string } | null
  channelConnectionConfig?: Record<string, unknown> | null
} = {}) {
  const channelConnectionsUpsertMock = vi.fn().mockResolvedValue({ error: null })
  const channelConnectionsMaybeSingleMock = vi.fn().mockResolvedValue({
    data: channelConnectionConfig
      ? {
          config: channelConnectionConfig,
          last_sync: null,
          message_count: 0,
        }
      : null,
    error: null,
  })

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'org_integrations') {
        return {
          upsert: vi.fn().mockResolvedValue({ error: orgIntegrationsUpsertError }),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: orgIntegrationsSelectError,
                }),
              })),
            })),
          })),
        }
      }

      if (table === 'channel_connections') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: channelConnectionsMaybeSingleMock,
              })),
            })),
          })),
          upsert: channelConnectionsUpsertMock,
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return {
    supabase,
    channelConnectionsUpsertMock,
  }
}

describe('credentials legacy fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CREDENTIALS_KEY = 'bitbit-test-credentials-key'
  })

  it('stores credentials in channel_connections when org_integrations is unavailable', async () => {
    const { supabase, channelConnectionsUpsertMock } = createSupabaseMock({
      orgIntegrationsUpsertError: {
        message: "Could not find the table 'public.org_integrations' in the schema cache",
      },
      channelConnectionConfig: { existing: true },
    })

    await storeOrgCredential(
      supabase as never,
      'org-123',
      'gmail',
      { access_token: 'secret-token' },
      'user-123',
    )

    expect(channelConnectionsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org-123',
        channel_type: 'gmail',
        status: 'connected',
        config: expect.objectContaining({
          existing: true,
          credential_provider: 'gmail',
          credentials_encrypted: expect.any(String),
        }),
      }),
      { onConflict: 'org_id,channel_type' },
    )
    expect(logAuditEventMock).toHaveBeenCalled()
  })

  it('reads credentials back from channel_connections fallback', async () => {
    const encrypted = encryptCredential(
      JSON.stringify({
        access_token: 'secret-token',
        refresh_token: 'refresh-token',
      }),
    )

    const { supabase } = createSupabaseMock({
      orgIntegrationsSelectError: {
        message: "Could not find the table 'public.org_integrations' in the schema cache",
      },
      channelConnectionConfig: {
        credentials_encrypted: encrypted,
      },
    })

    const credential = await getOrgCredential(
      supabase as never,
      'org-123',
      'gmail',
    )

    expect(credential).toEqual({
      access_token: 'secret-token',
      refresh_token: 'refresh-token',
    })
  })
})
