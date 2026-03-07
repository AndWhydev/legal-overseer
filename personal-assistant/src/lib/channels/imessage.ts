import type { ChannelAdapter, ChannelMessage } from './types'
import { logger } from '@/lib/core/logger'

function appleEpochToDate(appleNanoseconds: number): Date {
  const unixSeconds = appleNanoseconds / 1_000_000_000 + 978307200
  return new Date(unixSeconds * 1000)
}

export const imessageAdapter: ChannelAdapter = {
  type: 'imessage',
  name: 'iMessage',
  description: 'Read messages from Apple iMessage (macOS only)',
  icon: 'MessageCircle',

  async pull(_config, since) {
    const { execSync } = await import('child_process')
    const { writeFileSync, unlinkSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { join } = await import('path')

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const appleEpochNanos = Math.floor((sinceDate.getTime() / 1000 - 978307200) * 1_000_000_000)

    const pythonScript = `
import sqlite3, json, os
import { logger } from '@/lib/core/logger';

def extract_text(blob):
    if not blob:
        return None
    try:
        marker = b'NSString'
        idx = blob.find(marker)
        if idx == -1:
            return None
        pos = idx + len(marker)
        while pos < len(blob) and blob[pos] != 0x2B:
            pos += 1
        pos += 1
        if pos >= len(blob):
            return None
        str_len = blob[pos]
        pos += 1
        if str_len == 0x81:
            str_len = blob[pos]
            pos += 1
        elif str_len == 0x82:
            str_len = (blob[pos] << 8) | blob[pos + 1]
            pos += 2
        if str_len <= 0 or pos + str_len > len(blob):
            return None
        return blob[pos:pos + str_len].decode('utf-8', errors='replace').strip()
    except:
        return None

db_path = os.path.expanduser('~/Library/Messages/chat.db')
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("""
    SELECT m.ROWID, m.text, m.attributedBody, m.date, m.is_from_me,
           h.id as handle_id, h.service,
           COALESCE(c.display_name, '') as chat_name
    FROM message m
    LEFT JOIN handle h ON m.handle_id = h.ROWID
    LEFT JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
    LEFT JOIN chat c ON cmj.chat_id = c.ROWID
    WHERE m.date > ${appleEpochNanos}
      AND m.is_from_me = 0
      AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL)
    ORDER BY m.date DESC
    LIMIT 200
""")

results = []
seen = set()
for row in cur.fetchall():
    rowid, text_col, attr_body, date_val, is_from_me, handle, service, chat_name = row
    if rowid in seen:
        continue
    seen.add(rowid)
    text = text_col
    if not text and attr_body:
        text = extract_text(attr_body)
    if not text or len(text.strip()) == 0:
        continue
    results.append({
        'rowid': rowid,
        'text': text.strip(),
        'date': date_val,
        'sender': handle or 'unknown',
        'service': service or 'iMessage',
        'chat_name': chat_name or '',
    })

print(json.dumps(results))
conn.close()
`

    const scriptPath = join(tmpdir(), `bitbit-imessage-${Date.now()}.py`)

    try {
      writeFileSync(scriptPath, pythonScript)
      const output = execSync(`python3 "${scriptPath}"`, {
        timeout: 15000,
        maxBuffer: 5 * 1024 * 1024,
      }).toString()

      const rows = JSON.parse(output) as Array<{
        rowid: number
        text: string
        date: number
        sender: string
        service: string
        chat_name: string
      }>

      return rows.map((row): ChannelMessage => ({
        id: `imessage-${row.rowid}`,
        channel: 'imessage',
        externalId: String(row.rowid),
        sender: row.chat_name || row.sender,
        subject: undefined,
        body: row.text,
        receivedAt: appleEpochToDate(row.date),
        isActionable: false,
        priority: 'medium',
        metadata: {
          handle: row.sender,
          service: row.service,
          chatName: row.chat_name,
        },
      }))
    } catch (err) {
      logger.error('iMessage pull failed:', err)
      return []
    } finally {
      try { unlinkSync(scriptPath) } catch {}
    }
  },

  async isAvailable() {
    if (typeof process === 'undefined' || process.platform !== 'darwin') return false
    try {
      const { existsSync } = await import('fs')
      return existsSync(`${process.env.HOME}/Library/Messages/chat.db`)
    } catch {
      return false
    }
  },
}
