import type { ChannelAdapter, ChannelMessage } from './types'

export const remindersAdapter: ChannelAdapter = {
  type: 'reminders',
  name: 'Reminders',
  description: 'Pull incomplete items from Apple Reminders',
  icon: 'Bell',

  async pull(_config, _since) {
    const { readFileSync, existsSync } = await import('fs')
    const { join } = await import('path')

    const cachePath = join(process.env.HOME || '', '.agent', 'cache', 'reminders.json')

    if (!existsSync(cachePath)) {
      // Fallback: try osascript with generous timeout
      return await pullViaAppleScript()
    }

    try {
      const raw = readFileSync(cachePath, 'utf-8')
      const reminders = JSON.parse(raw) as Array<{
        name: string
        body: string
        list: string
        priority: number
        dueDate: string
      }>

      function mapPriority(p: number): 'critical' | 'high' | 'medium' | 'low' {
        if (p >= 1 && p <= 4) return 'high'
        if (p === 5) return 'medium'
        if (p >= 6) return 'low'
        return 'medium'
      }

      return reminders.map((r, i): ChannelMessage => ({
        id: `reminders-${i}`,
        channel: 'reminders',
        externalId: `rem-${i}-${r.name.slice(0, 20)}`,
        sender: r.list || 'Reminders',
        subject: r.name,
        body: r.body || r.name,
        receivedAt: r.dueDate ? new Date(r.dueDate) : new Date(),
        isActionable: true,
        priority: mapPriority(r.priority),
        metadata: { list: r.list, dueDate: r.dueDate || null, applePriority: r.priority },
      }))
    } catch (err) {
      console.error('Reminders cache read failed:', err)
      return []
    }
  },

  async isAvailable() {
    if (typeof process === 'undefined' || process.platform !== 'darwin') return false
    const { existsSync } = await import('fs')
    const { join } = await import('path')
    const cachePath = join(process.env.HOME || '', '.agent', 'cache', 'reminders.json')
    return existsSync(cachePath)
  },
}

async function pullViaAppleScript(): Promise<ChannelMessage[]> {
  const { execSync } = await import('child_process')
  const { writeFileSync, unlinkSync } = await import('fs')
  const { tmpdir } = await import('os')
  const { join } = await import('path')

  const script = `
tell application "Reminders"
    set output to ""
    repeat with reminderList in lists
        set listName to name of reminderList
        set incompleteReminders to (every reminder of reminderList whose completed is false)
        repeat with r in incompleteReminders
            set reminderName to name of r
            try
                set reminderBody to body of r
            on error
                set reminderBody to ""
            end try
            if reminderBody is missing value then set reminderBody to ""
            try
                set dueDate to due date of r as string
            on error
                set dueDate to ""
            end try
            try
                set reminderPriority to priority of r
            on error
                set reminderPriority to 0
            end try
            set output to output & reminderName & "|||" & reminderBody & "|||" & dueDate & "|||" & (reminderPriority as string) & "|||" & listName & linefeed
        end repeat
    end repeat
end tell
return output`

  const scriptPath = join(tmpdir(), `bitbit-reminders-${Date.now()}.scpt`)

  try {
    writeFileSync(scriptPath, script)
    const output = execSync(`osascript "${scriptPath}"`, {
      timeout: 180000, // 3 minutes - Reminders.app is slow
      maxBuffer: 2 * 1024 * 1024,
    }).toString()

    const items: ChannelMessage[] = []
    const lines = output.split('\n').filter(l => l.trim().length > 0)

    function mapPriority(p: number): 'critical' | 'high' | 'medium' | 'low' {
      if (p >= 1 && p <= 4) return 'high'
      if (p === 5) return 'medium'
      if (p >= 6) return 'low'
      return 'medium'
    }

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('|||')
      const name = parts[0]?.trim()
      if (!name) continue

      const body = parts[1]?.trim() || ''
      const dueDate = parts[2]?.trim() || ''
      const priority = parseInt(parts[3]?.trim() || '0', 10)
      const list = parts[4]?.trim() || 'Reminders'

      items.push({
        id: `reminders-${i}`,
        channel: 'reminders',
        externalId: `rem-${i}-${name.slice(0, 20)}`,
        sender: list,
        subject: name,
        body: body || name,
        receivedAt: dueDate ? new Date(dueDate) : new Date(),
        isActionable: true,
        priority: mapPriority(priority),
        metadata: { list, dueDate: dueDate || null, applePriority: priority },
      })
    }

    return items
  } catch (err) {
    console.error('Reminders pull failed:', err)
    return []
  } finally {
    try { unlinkSync(scriptPath) } catch {}
  }
}
