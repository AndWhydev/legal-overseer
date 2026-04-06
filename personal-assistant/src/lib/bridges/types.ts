export interface FlyMachine {
  id: string
  name: string
  state: 'created' | 'starting' | 'started' | 'stopping' | 'stopped' | 'replacing' | 'destroying' | 'destroyed'
  region: string
  instance_id: string
  config: {
    image: string
    env: Record<string, string>
    guest: { cpu_kind: string; cpus: number; memory_mb: number }
    mounts?: { volume: string; path: string }[]
  }
  created_at: string
  updated_at: string
}

export type BridgeProtocol = 'imessage' | 'whatsapp' | 'android-messages'

export interface BridgeState {
  connection_id: string
  protocol: BridgeProtocol
  fly_machine_id: string
  fly_app_name: string
  matrix_user_id: string
  status: 'provisioning' | 'linking' | 'connected' | 'suspended' | 'error' | 'destroyed'
  linked_at: string | null
  last_message_at: string | null
}

export interface LinkingInfo {
  connection_id: string
  protocol: BridgeProtocol
  link_type: 'qr' | 'credentials' | 'vnc'
  link_data: string | null
  status: 'waiting' | 'linked' | 'error'
  error?: string
}

export interface FlyVolume {
  id: string
  name: string
  size_gb: number
  state: string
  region: string
}

export interface MacVpsInstance {
  id: string
  vps_id: string
  vps_ip: string
  ssh_key_fingerprint: string
  bb_server_url: string
  bb_password: string
  vnc_port: number
  vnc_password: string
  status: 'warm' | 'claimed' | 'active' | 'destroying'
  claimed_by_connection_id: string | null
  created_at: string
}

export interface BlueBubblesConfig {
  bb_server_url: string
  bb_password: string
  vps_ip: string
  vps_id: string
  ssh_key_fingerprint: string
  vnc_port: number
  vnc_password: string
  apple_id_email: string
  protocol: 'imessage'
  linked_at: string | null
  last_message_at: string | null
}

export interface BlueBubblesWebhookPayload {
  type: string
  data: {
    guid: string
    text: string | null
    isFromMe: boolean
    dateCreated: number
    handle: {
      address: string
      service: string
    } | null
    chats: { guid: string; displayName: string }[]
    attachments: {
      guid: string
      mimeType: string
      filePath: string
      transferName: string
    }[]
  }
}
