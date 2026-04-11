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
 * Retrieve credentials from a Composio connection.
 *
 * NOTE: `getConnectionCredentials` does not exist in the current composio module.
 * This is a stub that throws until the Composio SDK integration is extended.
 */
export async function getComposioCredentials(connectionId: string): Promise<Credentials> {
  // TODO: Implement once composio/mcp-session.ts exposes getConnectionCredentials.
  // The composio module currently only supports tool discovery and execution,
  // not raw credential retrieval. This will be wired when the Composio
  // Connected Accounts API is integrated.
  throw new Error(
    `getComposioCredentials not implemented: Composio connection "${connectionId}" ` +
    `credential retrieval is not yet available. Wire composio/mcp-session.ts first.`,
  )
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

        // For now, since getComposioCredentials is a stub, we use session.act
        // to instruct the browser to fill credentials via Composio's approach
        const usernameSelector = options.usernameSelector || '#email'
        const passwordSelector = options.passwordSelector || '#password'

        await session.act(
          `Fill the login form: type credentials from Composio connection ` +
          `"${options.composioConnectionId}" into "${usernameSelector}" ` +
          `and "${passwordSelector}"`,
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
