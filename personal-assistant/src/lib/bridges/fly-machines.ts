import type { FlyMachine, FlyVolume } from './types'

const FLY_API_BASE = 'https://api.machines.dev/v1'

export class FlyMachinesClient {
  constructor(
    private token: string,
    private appName: string,
  ) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${FLY_API_BASE}/apps/${this.appName}${path}`
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Fly API error ${res.status}: ${body}`)
    }

    const text = await res.text()
    return text ? JSON.parse(text) : ({} as T)
  }

  async createMachine(opts: {
    name: string
    region: string
    image: string
    env: Record<string, string>
    cpus: number
    memoryMb: number
    volumeId?: string
  }): Promise<FlyMachine> {
    return this.request<FlyMachine>('/machines', {
      method: 'POST',
      body: JSON.stringify({
        name: opts.name,
        region: opts.region,
        config: {
          image: opts.image,
          env: opts.env,
          guest: {
            cpu_kind: 'shared',
            cpus: opts.cpus,
            memory_mb: opts.memoryMb,
          },
          mounts: opts.volumeId
            ? [{ volume: opts.volumeId, path: '/data' }]
            : undefined,
          auto_destroy: false,
        },
      }),
    })
  }

  async getMachine(machineId: string): Promise<FlyMachine> {
    return this.request<FlyMachine>(`/machines/${machineId}`)
  }

  async listMachines(): Promise<FlyMachine[]> {
    return this.request<FlyMachine[]>('/machines')
  }

  async startMachine(machineId: string): Promise<void> {
    await this.request(`/machines/${machineId}/start`, { method: 'POST' })
  }

  async stopMachine(machineId: string): Promise<void> {
    await this.request(`/machines/${machineId}/stop`, { method: 'POST' })
  }

  async destroyMachine(machineId: string): Promise<void> {
    await this.request(`/machines/${machineId}`, { method: 'DELETE' })
  }

  async waitForState(machineId: string, state: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const machine = await this.getMachine(machineId)
      if (machine.state === state) return
      await new Promise(r => setTimeout(r, 1000))
    }
    throw new Error(`Timed out waiting for machine ${machineId} to reach state ${state}`)
  }

  async createVolume(opts: { name: string; region: string; sizeGb: number }): Promise<FlyVolume> {
    return this.request<FlyVolume>('/volumes', {
      method: 'POST',
      body: JSON.stringify({
        name: opts.name,
        region: opts.region,
        size_gb: opts.sizeGb,
      }),
    })
  }

  async deleteVolume(volumeId: string): Promise<void> {
    await this.request(`/volumes/${volumeId}`, { method: 'DELETE' })
  }
}

/**
 * Create a FlyMachinesClient from environment variables.
 */
export function createFlyClient(appName = 'bitbit-bridges'): FlyMachinesClient {
  const token = process.env.FLY_API_TOKEN
  if (!token) throw new Error('FLY_API_TOKEN environment variable required')
  return new FlyMachinesClient(token, appName)
}
