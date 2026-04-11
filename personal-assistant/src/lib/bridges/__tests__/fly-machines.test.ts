import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FlyMachinesClient } from '../fly-machines'

describe('FlyMachinesClient', () => {
  const mockFetch = vi.fn()
  let client: FlyMachinesClient

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
    client = new FlyMachinesClient('test-token', 'bitbit-bridges')
  })

  it('creates a machine with correct config', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'mach_123', state: 'created', name: 'bridge-user1' }),
      text: () => Promise.resolve(JSON.stringify({ id: 'mach_123', state: 'created', name: 'bridge-user1' })),
    })

    const result = await client.createMachine({
      name: 'bridge-user1',
      region: 'syd',
      image: 'registry.fly.io/bitbit-bridges:latest',
      env: { BRIDGE_PROTOCOL: 'imessage' },
      cpus: 1,
      memoryMb: 256,
    })

    expect(result.id).toBe('mach_123')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.machines.dev/v1/apps/bitbit-bridges/machines',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('stops a machine', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') })

    await client.stopMachine('mach_123')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.machines.dev/v1/apps/bitbit-bridges/machines/mach_123/stop',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('starts a machine', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') })

    await client.startMachine('mach_123')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.machines.dev/v1/apps/bitbit-bridges/machines/mach_123/start',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('destroys a machine', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') })

    await client.destroyMachine('mach_123')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.machines.dev/v1/apps/bitbit-bridges/machines/mach_123',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('gets machine state', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ id: 'mach_123', state: 'started' })),
    })

    const machine = await client.getMachine('mach_123')
    expect(machine.state).toBe('started')
  })

  it('creates a volume', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ id: 'vol_123', name: 'bridge_data_user1', size_gb: 1 })),
    })

    const vol = await client.createVolume({ name: 'bridge_data_user1', region: 'syd', sizeGb: 1 })
    expect(vol.id).toBe('vol_123')
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Machine limit reached'),
    })

    await expect(client.createMachine({
      name: 'bridge-fail',
      region: 'syd',
      image: 'test',
      env: {},
      cpus: 1,
      memoryMb: 256,
    })).rejects.toThrow('Fly API error 422')
  })
})
