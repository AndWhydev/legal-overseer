import { describe, it, expect, vi } from 'vitest'
import { BridgeLifecycle } from '../bridge'
import type { BridgeProvisioner } from '../../../bridges/bridge-provisioner'
import type { MacVpsProvisioner } from '../../../bridges/mac-vps-provisioner'
import type { OrgConnection } from '../../../connections/types'

function makeBridgeProvisioner(): BridgeProvisioner {
  return {
    provision: vi.fn().mockResolvedValue({
      connection_id: 'c1',
      protocol: 'whatsapp',
      link_type: 'qr',
      link_data: null,
      status: 'waiting',
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
    wake: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    checkHealth: vi.fn().mockResolvedValue({ running: true, state: 'started' }),
  } as unknown as BridgeProvisioner
}

function makeMacVpsProvisioner(): MacVpsProvisioner {
  return {
    provision: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
    checkHealth: vi.fn().mockResolvedValue(true),
    checkImessageActive: vi.fn().mockResolvedValue(true),
  } as unknown as MacVpsProvisioner
}

function makeSupabase() {
  const updates: any[] = []
  const deletes: string[] = []
  const single = vi.fn().mockResolvedValue({ data: { id: 'c1' }, error: null })
  const from = vi.fn(() => ({
    upsert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })),
    update: vi.fn((u: any) => {
      updates.push(u)
      return { eq: vi.fn().mockResolvedValue({ error: null }) }
    }),
    delete: vi.fn(() => ({
      eq: vi.fn((_col, id: string) => {
        deletes.push(id)
        return Promise.resolve({ error: null })
      }),
    })),
    select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })),
  }))
  return { supabase: { from } as any, updates, deletes }
}

describe('BridgeLifecycle', () => {
  it('provision delegates to BridgeProvisioner for whatsapp', async () => {
    const { supabase } = makeSupabase()
    const bp = makeBridgeProvisioner()
    const lifecycle = new BridgeLifecycle({ supabase, bridgeProvisioner: bp })

    const result = await lifecycle.provision({
      orgId: 'org-1',
      userId: 'user-1',
      providerId: 'whatsapp',
    })

    expect(bp.provision).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: 'whatsapp', orgId: 'org-1', userId: 'user-1' }),
    )
    expect(result.kind).toBe('linking_info')
  })

  it('disconnect destroys Fly machine when fly_machine_id is present', async () => {
    const { supabase, deletes } = makeSupabase()
    const bp = makeBridgeProvisioner()
    const lifecycle = new BridgeLifecycle({ supabase, bridgeProvisioner: bp })

    const conn = {
      id: 'c1',
      transport: 'bridge',
      config: { fly_machine_id: 'mach_abc', fly_volume_id: 'vol_xyz' },
    } as unknown as OrgConnection

    await lifecycle.disconnect(conn, { hard: true })

    expect(bp.destroy).toHaveBeenCalledWith('c1', 'mach_abc', 'vol_xyz')
    expect(deletes).toContain('c1')
  })

  it('disconnect destroys Mac VPS when vps_ip is present', async () => {
    const { supabase } = makeSupabase()
    const bp = makeBridgeProvisioner()
    const mac = makeMacVpsProvisioner()
    const lifecycle = new BridgeLifecycle({
      supabase,
      bridgeProvisioner: bp,
      macVpsProvisioner: mac,
    })

    const conn = {
      id: 'c1',
      transport: 'bridge',
      config: { vps_ip: '10.0.0.1' },
    } as unknown as OrgConnection

    await lifecycle.disconnect(conn, { hard: true })

    expect(mac.destroy).toHaveBeenCalledWith('c1', '10.0.0.1')
  })

  it('healthCheck maps Fly state to health', async () => {
    const { supabase } = makeSupabase()
    const bp = makeBridgeProvisioner()
    ;(bp.checkHealth as any).mockResolvedValueOnce({ running: false, state: 'stopped' })
    const lifecycle = new BridgeLifecycle({ supabase, bridgeProvisioner: bp })

    const conn = {
      id: 'c1',
      transport: 'bridge',
      config: { fly_machine_id: 'mach_abc' },
    } as unknown as OrgConnection

    const report = await lifecycle.healthCheck(conn)
    expect(report.healthy).toBe(false)
    expect(report.error).toContain('fly_state=stopped')
  })
})
