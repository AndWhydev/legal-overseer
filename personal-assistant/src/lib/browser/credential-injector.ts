/**
 * Credential injection for browser automation sessions.
 *
 * Supports two credential sources:
 * - Composio: retrieves credentials from a Composio connection
 * - 1Password: retrieves credentials via `op read` CLI
 *
 * The injector fills login forms via the session's act() method,
 * keeping credential material out of agent context/logs.
 */

import { getComposioClient } from '@/lib/composio/client'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CredentialSource = 'none' | 'composio' | '1password'

export interface CredentialOptions {
  /** Composio connection ID (required for 'composio' source) */
  composioConnectionId?: string
  /** 1Password secret reference (required for '1password' source) */
  opSecretRef?: string
  /** CSS selector for the username/email field */
  usernameSelector?: string
  /** CSS selector for the password field */
  passwordSelector?: string
}

export interface CredentialResult {
  success: boolean
  error?: string
}

interface Credentials {
  username: string
  password: string
}

// ---------------------------------------------------------------------------
// Composio credential retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieve credentials from a Composio connected account.
 *
 * Only BASIC auth (username + password) is supported — OAuth/API-key schemes
 * produce access tokens rather than fillable form credentials, so the browser
 * auto-fill flow doesn't apply to them.
 *
 * Shape of the SDK response (from `@composio/core` ConnectedAccountRetrieveResponse):
 *   { id, status, toolkit, authConfig, state?: { authScheme, val }, data?, ... }
 *
 * For legacy/transitional responses the credentials can also appear under
 * `data.authSchemeName` + `data.username`/`data.password`, so we check both.
 */
export async function getComposioCredentials(connectionId: string): Promise<Credentials> {
  const composio = getComposioClient()
  if (!composio) {
    throw new Error(
      'Composio is not configured — COMPOSIO_API_KEY environment variable is missing.',
    )
  }

  let account: Record<string, any>
  try {
    account = await (composio as unknown as {
      connectedAccounts: {
        get: (id: string) => Promise<Record<string, any>>
      }
    }).connectedAccounts.get(connectionId)
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err)
    logger.error('[credential-injector] Composio connected-account lookup failed', {
      connectionId,
      error: errMessage,
    })
    throw new Error(
      `Composio connected account "${connectionId}" not found or inaccessible: ${errMessage}`,
    )
  }

  if (!account || typeof account !== 'object') {
    throw new Error(`Composio connected account "${connectionId}" returned no data.`)
  }

  // Prefer the canonical `state` shape (ConnectedAccountRetrieveResponse.state),
  // fall back to the deprecated `data` field for older connections.
  const stateBlock = (account.state ?? null) as { authScheme?: string; val?: any } | null
  const dataBlock = (account.data ?? null) as Record<string, any> | null

  const authScheme: string | undefined =
    stateBlock?.authScheme ?? dataBlock?.authSchemeName ?? dataBlock?.authScheme

  const status: string | undefined =
    stateBlock?.val?.status ?? (account.status as string | undefined)

  if (!authScheme) {
    throw new Error(
      `Composio connected account "${connectionId}" has no auth scheme metadata ` +
      `— cannot determine credential type.`,
    )
  }

  if (authScheme !== 'BASIC') {
    throw new Error(
      `Composio connected account "${connectionId}" uses auth scheme "${authScheme}", ` +
      `but browser auto-fill requires BASIC (username + password). ` +
      `OAuth and API-key connections produce access tokens rather than fillable form credentials.`,
    )
  }

  if (status !== 'ACTIVE') {
    throw new Error(
      `Composio connected account "${connectionId}" is not ACTIVE (status: "${status ?? 'unknown'}"). ` +
      `Re-authenticate the connection before injecting credentials.`,
    )
  }

  const credentialBag = (stateBlock?.val ?? dataBlock ?? {}) as Record<string, unknown>
  const username = credentialBag.username
  const password = credentialBag.password

  if (typeof username !== 'string' || username.length === 0) {
    throw new Error(
      `Composio BASIC connection "${connectionId}" is missing a username.`,
    )
  }
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error(
      `Composio BASIC connection "${connectionId}" is missing a password.`,
    )
  }

  return { username, password }
}

// ---------------------------------------------------------------------------
// 1Password credential retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieve credentials from 1Password using `op read`.
 *
 * Expects `secretRef` in the format "op://<vault>/<item>/<field>"
 * for both username and password fields.
 */
export async function get1PasswordCredentials(secretRef: string): Promise<Credentials> {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const execFileAsync = promisify(execFile)

  // Read username and password fields from the 1Password item
  const usernameRef = `${secretRef}/username`
  const passwordRef = `${secretRef}/password`

  try {
    const [usernameResult, passwordResult] = await Promise.all([
      execFileAsync('op', ['read', usernameRef]),
      execFileAsync('op', ['read', passwordRef]),
    ])

    return {
      username: usernameResult.stdout.trim(),
      password: passwordResult.stdout.trim(),
    }
  } catch (err) {
    throw new Error(
      `1Password credential retrieval failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Credential injection
// ---------------------------------------------------------------------------

/**
 * Inject credentials into a browser session's login form.
 *
 * @param session - Browser automation session with an act() method
 * @param source  - Which credential backend to use
 * @param options - Selectors and connection identifiers
 */
export async function injectCredentials(
  session: { act: (instruction: string) => Promise<any> },
  source: CredentialSource,
  options: CredentialOptions,
): Promise<CredentialResult> {
  if (source === 'none') {
    return { success: true }
  }

  try {
    let credentials: Credentials

    switch (source) {
      case 'composio': {
        if (!options.composioConnectionId) {
          return {
            success: false,
            error: 'Missing required composioConnectionId for Composio credential source',
          }
        }

        credentials = await getComposioCredentials(options.composioConnectionId)

        const usernameSelector = options.usernameSelector || '#email'
        const passwordSelector = options.passwordSelector || '#password'

        await session.act(
          `Fill "${usernameSelector}" with "${credentials.username}" ` +
          `and "${passwordSelector}" with the password`,
        )

        return { success: true }
      }

      case '1password': {
        if (!options.opSecretRef) {
          return {
            success: false,
            error: 'Missing required opSecretRef for 1Password credential source',
          }
        }

        credentials = await get1PasswordCredentials(options.opSecretRef)

        const usernameSelector = options.usernameSelector || '#email'
        const passwordSelector = options.passwordSelector || '#password'

        await session.act(
          `Fill "${usernameSelector}" with "${credentials.username}" ` +
          `and "${passwordSelector}" with the password`,
        )

        return { success: true }
      }

      default:
        return {
          success: false,
          error: `Unknown credential source: "${source}"`,
        }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error('[credential-injector] Injection failed', {
      source,
      error: errorMessage,
    })
    return {
      success: false,
      error: errorMessage,
    }
  }
}
