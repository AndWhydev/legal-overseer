/**
 * ConnectorLifecycle — the uniform contract every transport implements.
 *
 * Each TransportType has its own implementation (see ./lifecycles/*.ts):
 *   - bridge   → wraps BridgeProvisioner / MacVpsProvisioner (Fly + Mac VPS)
 *   - composio → wraps the Composio SDK (OAuth + triggers + refresh)
 *   - poll     → thin wrapper over provider.pull / provider.send
 *   - webhook  → inbound-only; disconnect rotates webhook_secret
 *
 * The ConnectorManager (./manager.ts) routes all lifecycle ops through
 * this interface, so API routes, crons, and the UI never have to branch
 * on transport.
 */
import type { OrgConnection, TransportType } from '../connections/types'

// ─── Operation inputs / outputs ──────────────────────────────────────────────

export interface ProvisionInput {
  orgId: string
  userId: string
  /** Provider id (e.g. 'gmail', 'whatsapp'). Must exist in the registry. */
  providerId: string
  /** Free-form config (bridge protocol, composio appKey, webhook url, …). */
  options?: Record<string, unknown>
  /** Where Composio/OAuth flows should redirect after the user authorises. */
  callbackUrl?: string
}

export type ProvisionResult =
  | {
      kind: 'oauth_redirect'
      redirectUrl: string
      connectionRequestId?: string
      /** Row id that was created/updated. */
      connectionId: string
    }
  | {
      kind: 'linking_info'
      connectionId: string
      linkType: 'qr' | 'vnc' | 'credentials'
      linkData: unknown
    }
  | {
      kind: 'immediate'
      connectionId: string
    }

export interface ActivateContext {
  /** Remote account id (e.g. Composio connected_account_id) if known. */
  accountId?: string
  /** Optional metadata captured during OAuth (auth_expires_at, scopes, …). */
  metadata?: Record<string, unknown>
}

export type RefreshResult =
  | { kind: 'refreshed'; authExpiresAt: string | null }
  | { kind: 'expired'; error?: string }
  | { kind: 'noop' }

export type SuspendReason = 'idle' | 'user' | 'error' | 'quota' | 'migration'

export interface DisconnectOptions {
  /** If true, deletes the row + external resources. If false, soft-disables. */
  hard: boolean
  /** Who initiated the disconnect. */
  initiator?: 'user' | 'cron' | 'admin' | 'system'
  /** Optional reason surfaced in logs. */
  reason?: string
}

export interface HealthReport {
  healthy: boolean
  /** Normalized status the manager should write (manager may suppress). */
  nextStatus?: 'connected' | 'error' | 'auth_expired' | 'suspended' | 'needs_reauth'
  error?: string
  /** Optional auth_expires_at refresh captured during the health probe. */
  authExpiresAt?: string | null
  /** Provider-specific detail for logs. */
  details?: Record<string, unknown>
}

// ─── The interface ───────────────────────────────────────────────────────────

export interface ConnectorLifecycle {
  readonly transport: TransportType

  /**
   * Start a new connection. For OAuth this returns a redirect URL; for
   * bridges this returns linking info (QR/VNC/credentials). The row in
   * org_connections is created by the implementation in status
   * 'pending' or 'provisioning'.
   */
  provision(input: ProvisionInput): Promise<ProvisionResult>

  /**
   * Finish wiring after the user completes auth/linking. This is where
   * webhook triggers are registered, crawl jobs are dispatched, and the
   * row transitions to 'connected'.
   */
  activate(conn: OrgConnection, ctx: ActivateContext): Promise<void>

  /**
   * Refresh auth tokens / re-hydrate remote state. Called by the
   * connector-refresh cron for connections whose auth_expires_at is
   * approaching or past.
   */
  refresh(conn: OrgConnection): Promise<RefreshResult>

  /**
   * Move the connection to 'suspended' while preserving state so it
   * can be resumed later. Cheap transports may no-op.
   */
  suspend(conn: OrgConnection, reason: SuspendReason): Promise<void>

  /**
   * Tear down external resources and (optionally) delete the row.
   * MUST be idempotent — callable multiple times safely.
   */
  disconnect(conn: OrgConnection, opts: DisconnectOptions): Promise<void>

  /**
   * Probe the connection's liveness. Non-throwing — failures become
   * { healthy: false, error }. Results are written via
   * ConnectionHealthReporter, not by the lifecycle itself.
   */
  healthCheck(conn: OrgConnection): Promise<HealthReport>
}
