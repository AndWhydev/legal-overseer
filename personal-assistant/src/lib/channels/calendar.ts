import type { ChannelAdapter, ChannelMessage } from './types'

export const calendarAdapter: ChannelAdapter = {
  type: 'calendar',
  name: 'Calendar',
  description: 'Pull upcoming events from Apple Calendar',
  icon: 'CalendarDays',

  async pull(_config, since) {
    const { readFileSync, existsSync } = await import('fs')
    const { join } = await import('path')

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const cachePath = join(process.env.HOME || '', '.agent', 'cache', 'calendar-events.json')

    if (!existsSync(cachePath)) {
      return await pullViaAppleScript()
    }

    try {
      const raw = readFileSync(cachePath, 'utf-8')
      const events = JSON.parse(raw) as Array<{
        title: string
        calendar: string
        startDate: string
        location: string
        notes: string
      }>

      return events
        .filter(e => new Date(e.startDate) >= sinceDate)
        .map((evt, i): ChannelMessage => ({
          id: `calendar-${i}`,
          channel: 'calendar',
          externalId: `cal-${i}-${evt.title.slice(0, 20)}`,
          sender: evt.calendar || 'Calendar',
          subject: evt.title,
          body: [evt.startDate, evt.location, evt.notes].filter(Boolean).join(' — '),
          receivedAt: new Date(evt.startDate),
          isActionable: false,
          priority: 'medium',
          metadata: { location: evt.location, notes: evt.notes, calendarName: evt.calendar },
        }))
    } catch (err) {
      logger.error('Calendar cache read failed:', err)
      return []
    }
  },

  async isAvailable() {
    if (typeof process === 'undefined' || process.platform !== 'darwin') return false
    const { existsSync } = await import('fs')
    const { join } = await import('path')
    const cachePath = join(process.env.HOME || '', '.agent', 'cache', 'calendar-events.json')
    return existsSync(cachePath)
  },
}

async function pullViaAppleScript(): Promise<ChannelMessage[]> {
  const { execSync } = await import('child_process')
  const { writeFileSync, unlinkSync } = await import('fs')
  const { tmpdir } = await import('os')
  const { join } = await import('path')

  const script = `
tell application "Calendar"
    set output to ""
    repeat with cal in calendars
        try
            set calName to name of cal
            set evts to (every event of cal whose start date >= (current date) - 7 * days and start date <= (current date) + 14 * days)
            repeat with evt in evts
                set evtTitle to summary of evt
                set evtStart to start date of evt as string
                try
                    set evtLoc to location of evt
                on error
                    set evtLoc to ""
                end try
                if evtLoc is missing value then set evtLoc to ""
                try
                    set evtNotes to description of evt
                on error
                    set evtNotes to ""
                end try
                if evtNotes is missing value then set evtNotes to ""
                set output to output & evtTitle & "|||" & evtStart & "|||" & evtLoc & "|||" & evtNotes & "|||" & calName & linefeed
            end repeat
        end try
    end repeat
end tell
return output`

  const scriptPath = join(tmpdir(), `bitbit-calendar-${Date.now()}.scpt`)

  try {
    writeFileSync(scriptPath, script)
    const output = execSync(`osascript "${scriptPath}"`, {
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
    }).toString()

    const events: ChannelMessage[] = []
    const lines = output.split('\n').filter(l => l.trim().length > 0)

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('|||')
      const title = parts[0]?.trim()
      if (!title) continue

      const dateStr = parts[1]?.trim() || ''
      const location = parts[2]?.trim() || ''
      const notes = parts[3]?.trim() || ''
      const calendar = parts[4]?.trim() || 'Calendar'

      let eventDate: Date
      try {
        eventDate = new Date(dateStr)
        if (isNaN(eventDate.getTime())) eventDate = new Date()
      } catch {
        eventDate = new Date()
      }

      events.push({
        id: `calendar-${i}`,
        channel: 'calendar',
        externalId: `cal-${i}-${title.slice(0, 20)}`,
        sender: calendar,
        subject: title,
        body: [dateStr, location, notes].filter(Boolean).join(' — '),
        receivedAt: eventDate,
        isActionable: false,
        priority: 'medium',
        metadata: { location, notes, calendarName: calendar },
      })
    }

    return events
  } catch (err) {
    logger.error('Calendar pull failed:', err)
    return []
  } finally {
    try { unlinkSync(scriptPath) } catch {}
  }
}
