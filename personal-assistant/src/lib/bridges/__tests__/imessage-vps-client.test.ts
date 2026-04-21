import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ImessageVpsClient, isImessageVpsConfigured } from '../imessage-vps-client'

describe('ImessageVpsClient', () => {
  const cfg = {
    apiKey: 'test-key',
    apiBaseUrl: 'https://vps.example.com/v1',
    region: 'us-west',
    imageId: 'macos-sequoia-bb',
    planId: 'mac-small',
    sshKeyId: 'ssh-key-1',
  }

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as never
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createInstance', () => {
    it('POSTs to /instances with region, image, plan, ssh_key_id and returns normalized instance', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'inst-123',
          public_ip: '10.0.0.5',
          status: 'booting',
          created_at: '2026-04-17T00:00:00Z',
        }),
      })

      const client = new ImessageVpsClient(cfg)
      const inst = await client.createInstance({ name: 'bitbit-imessage-1' })

      expect(fetchMock).toHaveBeenCalledWith(
        'https://vps.example.com/v1/instances',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'bitbit-imessage-1',
            region: 'us-west',
            image: 'macos-sequoia-bb',
            plan: 'mac-small',
            ssh_key_id: 'ssh-key-1',
          }),
        }),
      )

      expect(inst.id).toBe('inst-123')
      expect(inst.ip).toBe('10.0.0.5')
      expect(inst.status).toBe('booting')
    })

    it('throws on non-2xx with the error body in the message', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Quota exceeded',
      })

      const client = new ImessageVpsClient(cfg)
      await expect(client.createInstance({ name: 'x' })).rejects.toThrow(/403.*Quota exceeded/)
    })
  })

  describe('getInstance', () => {
    it('returns null on 404', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })
      const client = new ImessageVpsClient(cfg)
      const inst = await client.getInstance('nope')
      expect(inst).toBeNull()
    })

    it('normalizes status from common vendor synonyms', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'i1', ip: '1.2.3.4', state: 'active' }),
      })
      const client = new ImessageVpsClient(cfg)
      const inst = await client.getInstance('i1')
      expect(inst!.status).toBe('running')
    })
  })

  describe('waitForRunning', () => {
    it('polls until status=running and returns the ready instance', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'i1', ip: '', status: 'booting' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'i1', ip: '10.0.0.5', status: 'running' }),
        })

      const client = new ImessageVpsClient(cfg)
      const ready = await client.waitForRunning('i1', 10_000, 1)

      expect(ready.status).toBe('running')
      expect(ready.ip).toBe('10.0.0.5')
    })

    it('throws when instance enters a terminal failure state', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'i1', ip: '', status: 'destroyed' }),
      })

      const client = new ImessageVpsClient(cfg)
      await expect(client.waitForRunning('i1', 10_000, 1)).rejects.toThrow(/terminal state: destroyed/)
    })
  })
})

describe('isImessageVpsConfigured', () => {
  const REQUIRED = [
    'IMESSAGE_VPS_API_KEY',
    'IMESSAGE_VPS_API_BASE_URL',
    'IMESSAGE_VPS_REGION',
    'IMESSAGE_VPS_IMAGE_ID',
    'IMESSAGE_VPS_PLAN_ID',
    'IMESSAGE_VPS_SSH_KEY_ID',
  ] as const

  const originalEnv = { ...process.env }

  afterEach(() => {
    for (const k of REQUIRED) delete process.env[k]
    Object.assign(process.env, originalEnv)
  })

  it('returns false when any var is missing', () => {
    for (const k of REQUIRED) delete process.env[k]
    expect(isImessageVpsConfigured()).toBe(false)

    // Only 5 of 6 set
    for (const k of REQUIRED.slice(0, 5)) process.env[k] = 'x'
    expect(isImessageVpsConfigured()).toBe(false)
  })

  it('returns true when all vars are set', () => {
    for (const k of REQUIRED) process.env[k] = 'x'
    expect(isImessageVpsConfigured()).toBe(true)
  })
})
