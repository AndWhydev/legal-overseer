/**
 * WhatsApp response formatting utilities.
 * Uses WhatsApp markdown: *bold*, _italic_, ~strikethrough~, ```monospace```
 */

export const formatResponse = {
  /** Format a section header */
  header(emoji: string, title: string): string {
    return `${emoji} *${title}*`
  },

  /** Format a numbered list of items */
  numberedList(items: string[]): string {
    return items.map((item, i) => `${i + 1}. ${item}`).join('\n')
  },

  /** Format a bulleted list */
  bulletList(items: string[]): string {
    return items.map((item) => `  - ${item}`).join('\n')
  },

  /** Section with header and content */
  section(emoji: string, title: string, content: string): string {
    return `${emoji} *${title}*\n\n${content}`
  },

  /** Confirmation prompt */
  confirmation(question: string, hint: string): string {
    return `${question}\n\n_${hint}_`
  },

  /** Clarification prompt */
  clarification(question: string, options?: string[]): string {
    let msg = `${question}`
    if (options && options.length > 0) {
      msg += '\n\n' + options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')
    }
    return msg
  },

  /** Error recovery with suggestions */
  didNotUnderstand(originalText: string, suggestions: string[]): string {
    let msg = `I didn't quite get that.`
    if (suggestions.length > 0) {
      msg += ` Did you mean:\n\n`
      msg += suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')
      msg += '\n\n_Or type *help* to see all commands._'
    }
    return msg
  },

  /** Generic error message */
  error(message: string, suggestions?: string[]): string {
    let msg = message
    if (suggestions && suggestions.length > 0) {
      msg += '\n\nTry:\n' + suggestions.map((s) => `  - ${s}`).join('\n')
    }
    return msg
  },

  /** Help menu */
  helpMenu(): string {
    return [
      `*BitBit Assistant*`,
      ``,
      `Here's what I can do:`,
      ``,
      `*Invoices*`,
      `  - "Invoice Sezer for $200"`,
      `  - "What invoices are overdue?"`,
      ``,
      `*Leads*`,
      `  - "Any new leads?"`,
      `  - "Status on the Acme deal"`,
      ``,
      `*Schedule*`,
      `  - "What's on today?"`,
      `  - "Schedule a call with Bob tomorrow"`,
      ``,
      `*Tasks*`,
      `  - "Remind me to call Sarah"`,
      `  - "Create task: follow up with John"`,
      ``,
      `*Reports*`,
      `  - "Weekly summary"`,
      `  - "Revenue this month"`,
      ``,
      `*Approvals*`,
      `  - Reply Y/N to approve or reject`,
      `  - "1Y" or "2N" for specific items`,
      ``,
      `*Search*`,
      `  - "Find Bob's number"`,
      `  - "Search plumber contacts"`,
      ``,
      `_Just text naturally — I'll figure it out!_`,
    ].join('\n')
  },

  /** Morning briefing format */
  morningBriefing(sections: BriefingSection[]): string {
    const lines: string[] = [
      `*Good morning! Here's your daily briefing:*`,
      ``,
    ]

    for (const section of sections) {
      if (section.items.length === 0 && !section.showEmpty) continue

      lines.push(`${section.emoji} *${section.title}*`)
      if (section.items.length === 0) {
        lines.push(`  _None_`)
      } else {
        for (const item of section.items.slice(0, 5)) {
          lines.push(`  - ${item}`)
        }
        if (section.items.length > 5) {
          lines.push(`  _...and ${section.items.length - 5} more_`)
        }
      }
      lines.push(``)
    }

    lines.push(`_Reply with any command or "help" for options._`)
    return lines.join('\n')
  },

  /** Proactive alert format */
  proactiveAlert(emoji: string, title: string, detail: string, action?: string): string {
    let msg = `${emoji} *${title}*\n\n${detail}`
    if (action) {
      msg += `\n\n_${action}_`
    }
    return msg
  },

  /** Approval request format */
  approvalRequest(
    agentName: string,
    summary: string,
    confidence: number,
    context?: string
  ): string {
    const pct = confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence)
    let msg = `*Approval Needed*\n\n`
    msg += `${agentName} wants to: ${summary}\n`
    msg += `Confidence: ${pct}%\n`
    if (context) {
      msg += `\n${context}\n`
    }
    msg += `\n_Reply Y to approve, N to reject_`
    return msg
  },

  /** Format invoice list */
  invoiceList(invoices: InvoiceDisplay[]): string {
    if (invoices.length === 0) return 'No invoices found.'
    const lines = invoices.map((inv, i) =>
      `${i + 1}. ${inv.title} — $${inv.total.toLocaleString()} (${statusEmoji(inv.status)} ${inv.status})`
    )
    return formatResponse.section('📄', 'Invoices', lines.join('\n'))
  },

  /** Format lead list */
  leadList(leads: LeadDisplay[]): string {
    if (leads.length === 0) return 'No active leads right now.'
    const lines = leads.map((lead, i) =>
      `${i + 1}. ${lead.name}${lead.value ? ` — $${lead.value.toLocaleString()}` : ''} (${lead.stage})`
    )
    return formatResponse.section('🔥', 'Active Leads', lines.join('\n'))
  },

  /** Format task list */
  taskList(tasks: TaskDisplay[]): string {
    if (tasks.length === 0) return 'No tasks found.'
    const lines = tasks.map((t, i) =>
      `${i + 1}. ${priorityEmoji(t.priority)} ${t.title}`
    )
    return formatResponse.section('📋', 'Tasks', lines.join('\n'))
  },
}

function statusEmoji(status: string): string {
  const map: Record<string, string> = {
    draft: '📝',
    sent: '📤',
    viewed: '👁',
    overdue: '🔴',
    paid: '✅',
    cancelled: '❌',
  }
  return map[status] ?? '📄'
}

function priorityEmoji(priority: string): string {
  const map: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  }
  return map[priority] ?? '⬜'
}

export interface BriefingSection {
  emoji: string
  title: string
  items: string[]
  showEmpty?: boolean
}

export interface InvoiceDisplay {
  title: string
  total: number
  status: string
}

export interface LeadDisplay {
  name: string
  value?: number
  stage: string
}

export interface TaskDisplay {
  title: string
  priority: string
}
