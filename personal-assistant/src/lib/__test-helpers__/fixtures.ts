/**
 * Test fixture factory for AWU (Andy Wilson Unlimited) domain data.
 */

let idCounter = 0
function nextId(prefix: string) {
  return `${prefix}-${++idCounter}`
}

export function resetIdCounter() {
  idCounter = 0
}

export function makeContact(overrides: Record<string, unknown> = {}) {
  const id = nextId('contact')
  return {
    id,
    org_id: 'org-awu',
    slug: `contact-${id}`,
    name: 'Sezer Ozturk',
    type: 'individual',
    emails: ['sezer@example.com'],
    phones: ['0412345678'],
    aliases: ['sezer', 'sez'],
    profile_data: { company: 'AWU Client' },
    communication_patterns: { preferred_channel: 'whatsapp' },
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function makeTask(overrides: Record<string, unknown> = {}) {
  const id = nextId('task')
  return {
    id,
    org_id: 'org-awu',
    title: 'Follow up with client',
    status: 'pending',
    priority: 'normal',
    metadata: { target_date: '2026-03-01', waiting_on: null },
    created_at: '2026-02-01T00:00:00Z',
    ...overrides,
  }
}

export function makeInvoice(overrides: Record<string, unknown> = {}) {
  const id = nextId('inv')
  return {
    id,
    org_id: 'org-awu',
    invoice_number: `INV-${String(idCounter).padStart(3, '0')}`,
    client_contact_id: 'contact-1',
    status: 'sent',
    total: 1500,
    due_date: '2026-03-15',
    paid_date: null,
    line_items: [
      { description: 'Web development services', quantity: 1, unit_price: 1500 },
    ],
    created_at: '2026-02-15T00:00:00Z',
    ...overrides,
  }
}

export function makeApproval(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId('approval'),
    org_id: 'org-awu',
    agent_config_id: 'agent-1',
    agent_run_id: null,
    action_type: 'send_email',
    action_payload: { to: 'sezer@example.com', subject: 'Follow up' },
    action_summary: 'Send proposal follow-up to Sezer',
    confidence_score: 0.7,
    routing_decision: 'ask',
    priority: 'normal',
    digest_eligible: false,
    status: 'pending',
    context_snapshot: {},
    resolved_by: null,
    resolved_at: null,
    resolved_via: null,
    expires_at: '2026-02-28T00:00:00Z',
    created_at: '2026-02-20T00:00:00Z',
    ...overrides,
  }
}

export function makeChannelMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId('msg'),
    channel: 'gmail',
    external_id: `ext-${idCounter}`,
    org_id: 'org-awu',
    sender: 'Sezer Ozturk',
    sender_email: 'sezer@example.com',
    subject: 'Project update',
    body: 'Hi Andy, just checking in on the project status.',
    received_at: '2026-02-20T10:00:00Z',
    significance: null,
    time_sensitivity: null,
    ...overrides,
  }
}
