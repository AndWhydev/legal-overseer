/**
 * MacBook Bridge — relay channel for services only accessible on the MacBook.
 *
 * Provides access to:
 * - Outlook (via Microsoft Graph, authenticated session)
 * - iMessage (via Python imessage.py tool)
 * - Apple Calendar (via AppleScript)
 * - Apple Reminders (via AppleScript)
 *
 * All calls go through SSH to the MacBook at 100.75.106.104 via Tailscale.
 * The MacBook must be awake and connected for these to work.
 */

import { logger } from '@/lib/core/logger'

const MACBOOK_HOST = 'macbook' // Tailscale SSH alias
const IMESSAGE_TOOL = '/Users/torrinkay/Agent/.agent/tools/imessage.py'

async function sshExec(command: string, timeoutMs: number = 15000): Promise<string> {
  const { execSync } = await import('child_process')
  try {
    const result = execSync(`ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${MACBOOK_HOST} ${JSON.stringify(command)}`, {
      timeout: timeoutMs,
      encoding: 'utf-8',
    })
    return result.trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('timed out') || msg.includes('Connection refused')) {
      logger.warn('[macbook-bridge] MacBook unreachable (sleeping or offline)')
      throw new Error('MacBook is offline or sleeping')
    }
    throw err
  }
}

// ─── iMessage ────────────────────────────────────────────────────────────────

export interface iMessageResult {
  sender: string
  text: string
  date: string
  isFromMe: boolean
}

/**
 * Read recent iMessages, optionally filtered by contact.
 */
export async function readIMessages(opts: {
  contact?: string
  hours?: number
  search?: string
  limit?: number
} = {}): Promise<iMessageResult[]> {
  let cmd = `python3 ${IMESSAGE_TOOL} read --json`
  if (opts.contact) cmd += ` --contact '${opts.contact}'`
  if (opts.hours) cmd += ` --hours ${opts.hours}`
  if (opts.search) cmd += ` --search '${opts.search}'`
  if (opts.limit) cmd += ` --limit ${opts.limit}`

  const output = await sshExec(cmd, 20000)

  try {
    const messages = JSON.parse(output)
    return Array.isArray(messages) ? messages : []
  } catch {
    // Non-JSON output — parse line-by-line
    return output.split('\n').filter(Boolean).map(line => ({
      sender: 'unknown',
      text: line,
      date: new Date().toISOString(),
      isFromMe: false,
    }))
  }
}

/**
 * Send an iMessage.
 */
export async function sendIMessage(contact: string, message: string): Promise<boolean> {
  const cmd = `python3 ${IMESSAGE_TOOL} send --contact '${contact}' --message '${message.replace(/'/g, "'\\''")}'`
  try {
    await sshExec(cmd, 10000)
    return true
  } catch (err) {
    logger.error('[macbook-bridge] iMessage send failed', { contact, error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

// ─── Outlook (via MacBook) ───────────────────────────────────────────────────

export interface OutlookMessage {
  id: string
  from: string
  subject: string
  body: string
  receivedAt: string
}

/**
 * Read recent Outlook emails via MacBook's authenticated session.
 */
export async function readOutlookEmails(count: number = 10): Promise<OutlookMessage[]> {
  // Use AppleScript to read from Mail.app (which has Outlook account configured)
  const script = `
tell application "Mail"
  set output to ""
  set msgs to messages of mailbox "INBOX" of account "Outlook"
  set maxCount to ${count}
  set i to 0
  repeat with msg in msgs
    if i >= maxCount then exit repeat
    set senderAddr to address of sender of msg
    set msgSubject to subject of msg
    set msgDate to date received of msg
    set msgContent to content of msg
    set output to output & "FROM:" & senderAddr & "||SUBJECT:" & msgSubject & "||DATE:" & msgDate & "||BODY:" & (text 1 thru 200 of msgContent) & "\\n---\\n"
    set i to i + 1
  end repeat
  return output
end tell`

  try {
    const raw = await sshExec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, 20000)
    return raw.split('\n---\n').filter(Boolean).map((block, i) => {
      const from = block.match(/FROM:(.*?)\|\|/)?.[1] ?? 'unknown'
      const subject = block.match(/SUBJECT:(.*?)\|\|/)?.[1] ?? ''
      const date = block.match(/DATE:(.*?)\|\|/)?.[1] ?? ''
      const body = block.match(/BODY:(.*)/)?.[1] ?? ''
      return { id: `outlook-${i}`, from, subject, body, receivedAt: date }
    })
  } catch (err) {
    logger.warn('[macbook-bridge] Outlook read failed', { error: err instanceof Error ? err.message : String(err) })
    return []
  }
}

/**
 * Send an email via MacBook's Outlook Graph Python tool.
 * Uses the cached OAuth token at ~/.config/ms365-inbox/app-token.json.
 * Sends from tor@allwebbedup.com.au via Microsoft Graph API.
 */
export async function sendOutlookEmail(to: string, subject: string, body: string, html?: boolean): Promise<boolean> {
  const escapedSubject = subject.replace(/'/g, "'\\''")
  const escapedBody = body.replace(/'/g, "'\\''")
  const htmlFlag = html ? ' --html' : ''

  const cmd = `python3 /Users/torrinkay/Agent/.agent/tools/outlook_graph.py send --to '${to}' --subject '${escapedSubject}' --body '${escapedBody}'${htmlFlag}`

  try {
    const result = await sshExec(cmd, 20000)
    const success = result.toLowerCase().includes('sent')
    if (success) {
      logger.info('[macbook-bridge] Outlook email sent via Graph tool', { to, subject })
    } else {
      logger.warn('[macbook-bridge] Outlook send unclear result', { to, result })
    }
    return success
  } catch (err) {
    logger.error('[macbook-bridge] Outlook send failed', { to, error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

// ─── Health Check ────────────────────────────────────────────────────────────

/**
 * Check if the MacBook bridge is reachable.
 */
export async function isBridgeAvailable(): Promise<boolean> {
  try {
    const result = await sshExec('echo ok', 5000)
    return result === 'ok'
  } catch {
    return false
  }
}
