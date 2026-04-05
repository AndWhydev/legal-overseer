import type { ProviderPlugin } from './types'

export class ProviderRegistry {
  private providers = new Map<string, ProviderPlugin>()

  register(plugin: ProviderPlugin): void {
    if (this.providers.has(plugin.id)) {
      throw new Error(`Provider "${plugin.id}" already registered`)
    }
    this.providers.set(plugin.id, plugin)
  }

  get(id: string): ProviderPlugin | undefined {
    return this.providers.get(id)
  }

  has(id: string): boolean {
    return this.providers.has(id)
  }

  list(): ProviderPlugin[] {
    return Array.from(this.providers.values())
  }

  listByCategory(category: string): ProviderPlugin[] {
    return this.list().filter(p => p.category === category)
  }

  listConnectable(): ProviderPlugin[] {
    return this.list().filter(p => !p.comingSoon)
  }
}
