/**
 * Credential injection for browser automation sessions.
 *
 * Supports two credential sources:
 * - Composio: retrieves credentials from a Composio connection
 * - 1Password: retrieves credentials via `op read` CLI
 *
 * The injector fills login forms via Stagehand's act() with the
 * `variables` parameter: the agent sees only the variable names and
 * descriptions, never the raw credential values. Stagehand performs the
 * substitution at the browser layer so credential material never enters
 * the LLM conversation, prompt cache, or tool logs.
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

/**
 * The shape of the Stagehand session we need for credential injection.
 *
 * We depend on `stagehand.act(instruction, { variables })` so values are
 * substituted at the browser layer and never sent to the LLM. The broader
 * Stagehand API surface is intentionally not typed here — the injector
 * only needs this one call path.
 */
export interface CredentialInjectionSession {
  stagehand: {
    act: (
      instruction: string,
      options?: {
        variables?: Record<
          string,
          | string
          | number
          | boolean
          | { value: string | number | boolean; description?: string }
        >
      },
    ) => Promise<unknown>
  }
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
 * Fill the login form by calling Stagehand's act() with variables.
 *
 * Stagehand shows the agent only the variable names + descriptions; the raw
 * values never reach the LLM or the prompt cache. Variables are then
 * substituted at the browser layer.
 *
 * Callers must construct Stagehand with `experimental: true` (and
 * `disableAPI: true`) so act() uses the local act handler that honours
 * the `variables` option — the hosted Stagehand API path does not support
 * experimental features.
 */
async function fillLoginForm(
  session: CredentialInjectionSession,
  credentials: Credentials,
  usernameSelector: string,
  passwordSelector: string,
): Promise<void> {
  await session.stagehand.act(
    `Fill the login form: type %username% into the ${usernameSelector} field ` +
    `and %password% into the ${passwordSelector} field, then submit.`,
    {
      variables: {
        username: {
          value: credentials.username,
          description: 'Email or username for the login form',
        },
        password: {
          value: credentials.password,
          description: 'Password for the login form',
        },
      },
    },
  )
}

/**
 * Inject credentials into a browser session's login form.
 *
 * @param session - Stagehand-backed browser session. We take the whole
 *                  session so act() receives the `variables` option.
 * @param source  - Which credential backend to use
 * @param options - Selectors and connection identifiers
 */
export async function injectCredentials(
  session: CredentialInjectionSession,
  source: CredentialSource,
  options: CredentialOptions,
): Promise<CredentialResult> {
  if (source === 'none') {
    return { success: true }
  }

  try {
    const usernameSelector = options.usernameSelector || '#email'
    const passwordSelector = options.passwordSelector || '#password'

    switch (source) {
      case 'composio': {
        if (!options.composioConnectionId) {
          return {
            success: false,
            error: 'Missing required composioConnectionId for Composio credential source',
          }
        }

        const credentials = await getComposioCredentials(options.composioConnectionId)
        await fillLoginForm(session, credentials, usernameSelector, passwordSelector)
        return { success: true }
      }

      case '1password': {
        if (!options.opSecretRef) {
          return {
            success: false,
            error: 'Missing required opSecretRef for 1Password credential source',
          }
        }

        const credentials = await get1PasswordCredentials(options.opSecretRef)
        await fillLoginForm(session, credentials, usernameSelector, passwordSelector)
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
    // NOTE: never include credential values in logs — errors from
    // getComposioCredentials/get1PasswordCredentials are already sanitised,
    // and the only other thrown source is Stagehand's act() which
    // references variables by name, not value.
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
