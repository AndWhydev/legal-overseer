import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BridgeProvisioner } from '../bridge-provisioner'
import type { FlyMachinesClient } from '../fly-machines'

function mockFlyClient(): FlyMachinesClient {
  return {
    createMachine: vi.fn().mockResolvedValue({ id: 'mach_abc', state: 'started', name: 'bridge-user1' }),
    getMachine: vi.fn().mockResolvedValue({ id: 'mach_abc', state: 'started' }),
    startMachine: vi.fn().mockResolvedValue(undefined),
    stopMachine: vi.fn().mockResolvedValue(undefined),
    destroyMachine: vi.fn().mockResolvedValue(undefined),
    waitForState: vi.fn().mockResolvedValue(undefined),
    createVolume: vi.fn().mockResolvedValue({ id: 'vol_xyz', name: 'bridge_data' }),
    deleteVolume: vi.fn().mockResolvedValue(undefined),
    listMachines: vi.fn().mockResolvedValue([]),
  } as unknown as FlyMachinesClient
}

function mockSupabase() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
  }
  return { from: vi.fn().mockReturnValue(chain), _chain: chain }
}

describe('BridgeProvisioner', () => {
  let provisioner: BridgeProvisioner
  let fly: ReturnType<typeof mockFlyClient>
  let supabase: ReturnType<typeof mockSupabase>

  beforeEach(() => {
    fly = mockFlyClient()
    supabase = mockSupabase()
    provisioner = new BridgeProvisioner(fly, supabase as any, {
      region: 'syd',
      image: 'registry.fly.io/bitbit-bridges:latest',
      conduitUrl: 'https://conduit.internal',
      webhookBaseUrl: 'https://app.bitbit.chat',
      registrationServerUrl: 'http://registration.internal',
    })
  })

  it('provisions a bridge machine and returns linking info', async () => {
    const result = await provisioner.provision({
      orgId: 'org-1',
      userId: 'user-1',
      connectionId: 'conn-1',
      protocol: 'whatsapp',
    })

    expect(fly.createVolume).toHaveBeenCalled()
    expect(fly.createMachine).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('bridge-'),
        env: expect.objectContaining({
          BRIDGE_PROTOCOL: 'whatsapp',
        }),
      }),
    )
    expect(result.connection_id).toBe('conn-1')
    expect(result.protocol).toBe('whatsapp')
    expect(result.link_type).toBe('qr')
  })

  it('uses credentials link type for imessage', async () => {
    const result = await provisioner.provision({
      orgId: 'org-1',
      userId: 'user-1',
      connectionId: 'conn-1',
      protocol: 'imessage',
    })

    expect(result.link_type).toBe('credentials')
    expect(fly.createMachine).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.objectContaining({
          BRIDGE_PROTOCOL: 'imessage',
          REGISTRATION_SERVER_URL: 'http://registration.internal',
        }),
      }),
    )
  })

  it('destroys machine and volume', async () => {
    await provisioner.destroy('conn-1', 'mach_abc', 'vol_xyz')

    expect(fly.destroyMachine).toHaveBeenCalledWith('mach_abc')
    expect(fly.deleteVolume).toHaveBeenCalledWith('vol_xyz')
  })
})
