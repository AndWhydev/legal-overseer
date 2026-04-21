export { FlyMachinesClient, createFlyClient } from './fly-machines'
export { BridgeProvisioner } from './bridge-provisioner'
export { suspendIdleBridges, checkBridgeHealth } from './bridge-lifecycle'
export type { FlyMachine, FlyVolume, BridgeProtocol, BridgeState, LinkingInfo } from './types'
export { MacVpsProvisioner } from './mac-vps-provisioner'
export type { ReplenishResult } from './mac-vps-provisioner'
export { VpsPool, TARGET_POOL_SIZE, POOL_PROVIDER } from './vps-pool'
export { ImessageVpsClient, createImessageVpsClient, isImessageVpsConfigured } from './imessage-vps-client'
export type { VpsInstance } from './imessage-vps-client'
export type { MacVpsInstance, BlueBubblesConfig, BlueBubblesWebhookPayload } from './types'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createFlyClient } from './fly-machines'
import { BridgeProvisioner } from './bridge-provisioner'
import { MacVpsProvisioner } from './mac-vps-provisioner'
import { VpsPool } from './vps-pool'
import { createImessageVpsClient, isImessageVpsConfigured } from './imessage-vps-client'

export function createProvisioner(supabase: SupabaseClient): BridgeProvisioner {
  const fly = createFlyClient()
  return new BridgeProvisioner(fly, supabase, {
    region: process.env.FLY_BRIDGE_REGION || 'syd',
    image: process.env.FLY_BRIDGE_IMAGE || 'registry.fly.io/bitbit-bridges:latest',
    conduitUrl: process.env.CONDUIT_INTERNAL_URL || 'http://conduit.internal:6167',
    webhookBaseUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat',
    registrationServerUrl: process.env.IMESSAGE_REGISTRATION_URL || 'http://registration.internal:8080',
  })
}

/**
 * Build a MacVpsProvisioner from env. The VPS client is only attached when
 * all IMESSAGE_VPS_* vars are present; without them the provisioner can
 * still claim existing pool instances, but replenishPool() will throw.
 */
export function createImessageProvisioner(supabase: SupabaseClient): MacVpsProvisioner {
  const pool = new VpsPool(supabase)
  const client = isImessageVpsConfigured() ? createImessageVpsClient() : undefined
  return new MacVpsProvisioner(
    supabase,
    pool,
    {
      sshPrivateKey: process.env.IMESSAGE_SSH_PRIVATE_KEY || '',
      sshUser: process.env.IMESSAGE_SSH_USER || 'admin',
      webhookBaseUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://app.bitbit.chat',
      setupScriptPath: process.env.IMESSAGE_VPS_SETUP_SCRIPT_PATH,
    },
    client,
  )
}
