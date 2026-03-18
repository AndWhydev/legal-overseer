/**
 * Built-in Swarm Templates
 *
 * Pre-defined swarm patterns for common agency operations.
 * These are seeded into swarm_templates on first use.
 */

import type { SwarmDefinition } from './types'

// ── Pitch Prep ──────────────────────────────────────────────────────────────
// "Prepare for the Thomson pitch"
// Sales gathers history, Finance pulls payment data, Comms drafts outreach

export const PITCH_PREP: SwarmDefinition = {
  version: '1.0',
  inputSchema: {
    clientName: {
      type: 'string',
      description: 'Name of the client to prepare pitch for',
      required: true,
    },
    projectContext: {
      type: 'string',
      description: 'Optional context about what the pitch is for',
      required: false,
    },
    deadline: {
      type: 'string',
      description: 'When the pitch needs to be ready',
      required: false,
    },
  },
  steps: [
    {
      key: 'resolve_client',
      type: 'agent',
      label: 'Resolve Client',
      description: 'Find the client contact and load their full profile',
      agentRole: 'coordinator',
      prompt: 'Search for the contact "{{clientName}}" and load their full profile including relationships, recent activity, financial signals, and any active tasks or projects. Return the contact details.',
      modelTier: 'conversation',
      dependsOn: [],
      outputSchema: {
        contactId: 'string - the contact UUID',
        contactName: 'string - full name',
        company: 'string - company name',
        recentActivity: 'string[] - recent interactions',
      },
    },
    {
      key: 'gather_history',
      type: 'agent',
      label: 'Gather History',
      description: 'Sales agent gathers all communication history and past projects',
      agentRole: 'sales',
      persona: {
        voice: 'Focus on relationship strength, past wins, and opportunities for growth. Note any unresolved issues.',
      },
      prompt: 'Search all past communications with {{clientName}}. Summarize: (1) relationship history and key milestones, (2) past projects and their outcomes, (3) any unresolved issues or complaints, (4) opportunities mentioned but not pursued. Be comprehensive.',
      modelTier: 'conversation',
      dependsOn: ['resolve_client'],
      outputSchema: {
        relationshipSummary: 'string - overall relationship assessment',
        pastProjects: 'object[] - list of past projects with outcomes',
        openOpportunities: 'string[] - unresolved opportunities',
        risks: 'string[] - potential issues to be aware of',
      },
    },
    {
      key: 'pull_financials',
      type: 'agent',
      label: 'Pull Financial Data',
      description: 'Finance agent reviews payment history and outstanding obligations',
      agentRole: 'finance',
      prompt: 'Review all financial data for {{clientName}}: (1) total revenue from this client, (2) outstanding invoices and their status, (3) payment patterns (early/on-time/late), (4) average project value, (5) any disputed amounts. Flag any financial concerns.',
      modelTier: 'conversation',
      dependsOn: ['resolve_client'],
      outputSchema: {
        totalRevenue: 'number - total revenue from client',
        outstandingInvoices: 'object[] - unpaid invoices',
        paymentPattern: 'string - early/on-time/late',
        avgProjectValue: 'number - average project value',
        financialConcerns: 'string[] - any issues',
      },
    },
    {
      key: 'research_context',
      type: 'agent',
      label: 'Research Context',
      description: 'Research agent gathers external context about the client',
      agentRole: 'research',
      prompt: 'Research {{clientName}} company: (1) recent news or announcements, (2) industry trends relevant to them, (3) competitor activity, (4) any public information about their upcoming needs. {{projectContext}}',
      modelTier: 'conversation',
      dependsOn: [],
      outputSchema: {
        companyNews: 'string[] - recent news items',
        industryTrends: 'string[] - relevant trends',
        competitorActivity: 'string - competitor landscape',
      },
    },
    {
      key: 'synthesize_brief',
      type: 'agent',
      label: 'Synthesize Pitch Brief',
      description: 'Coordinator synthesizes all findings into a pitch brief',
      agentRole: 'coordinator',
      prompt: 'Synthesize all gathered information into a comprehensive pitch brief for {{clientName}}. Include: (1) Executive summary of the relationship, (2) Financial overview and any concerns from Finance, (3) Key talking points based on history, (4) Recommended approach and pricing strategy, (5) Risk factors to address, (6) Suggested next steps. {{projectContext}}',
      modelTier: 'synthesis',
      dependsOn: ['gather_history', 'pull_financials', 'research_context'],
      outputSchema: {
        pitchBrief: 'string - complete pitch brief document',
        recommendedApproach: 'string - suggested pitch strategy',
        suggestedPricing: 'string - pricing recommendation',
      },
    },
    {
      key: 'draft_outreach',
      type: 'agent',
      label: 'Draft Outreach',
      description: 'Comms agent drafts the initial outreach message',
      agentRole: 'comms',
      prompt: 'Based on the pitch brief, draft a professional outreach email to {{clientName}} to set up a pitch meeting. Reference specific past work and recent developments. Keep it personal and warm. Include a suggested meeting time within the next week. {{deadline}}',
      modelTier: 'conversation',
      dependsOn: ['synthesize_brief'],
      requiresApproval: true,
      outputSchema: {
        emailSubject: 'string - email subject line',
        emailBody: 'string - full email body',
        suggestedSendTime: 'string - optimal send time',
      },
    },
  ],
  governance: {
    approvalRequired: ['draft_outreach'],
    notifyOnComplete: ['synthesize_brief'],
    costCeiling: 2.00,
    timeoutMs: 300000, // 5 minutes
    negotiationModel: 'conversation',
  },
}

// ── Client Onboarding ───────────────────────────────────────────────────────
// "Onboard Acme Corp"
// Setup project, create contacts, draft welcome email, schedule kickoff

export const CLIENT_ONBOARDING: SwarmDefinition = {
  version: '1.0',
  inputSchema: {
    clientName: {
      type: 'string',
      description: 'Name of the new client',
      required: true,
    },
    contactEmail: {
      type: 'string',
      description: 'Primary contact email',
      required: false,
    },
    projectType: {
      type: 'string',
      description: 'Type of project (e.g., website, branding, maintenance)',
      required: false,
    },
    projectValue: {
      type: 'number',
      description: 'Estimated project value',
      required: false,
    },
  },
  steps: [
    {
      key: 'check_existing',
      type: 'agent',
      label: 'Check Existing Records',
      description: 'Verify client does not already exist in the system',
      agentRole: 'operations',
      prompt: 'Search contacts for "{{clientName}}" and check if they already exist in the system. If they do, return their details. If not, confirm they are a new client. Also check for any leads that might match.',
      modelTier: 'conversation',
      dependsOn: [],
      outputSchema: {
        exists: 'boolean - whether client already exists',
        existingContactId: 'string | null - existing contact ID if found',
        existingLeadId: 'string | null - existing lead ID if found',
      },
    },
    {
      key: 'create_contact',
      type: 'agent',
      label: 'Create Contact',
      description: 'Create the client contact record',
      agentRole: 'operations',
      prompt: 'Create a new contact for "{{clientName}}" with email {{contactEmail}}. Set them as a client (not a lead). Add relevant tags based on the project type: {{projectType}}.',
      modelTier: 'conversation',
      dependsOn: ['check_existing'],
      condition: {
        sourceStep: 'check_existing',
        path: '$.exists',
        operator: 'eq',
        value: false,
      },
      outputSchema: {
        contactId: 'string - new contact UUID',
        contactSlug: 'string - contact slug',
      },
    },
    {
      key: 'setup_project',
      type: 'agent',
      label: 'Setup Project Tasks',
      description: 'Create project tasks on the kanban board',
      agentRole: 'operations',
      prompt: 'Create a set of onboarding tasks for new client "{{clientName}}" on the kanban board: (1) "Kickoff meeting with {{clientName}}" in To Do, (2) "Gather brand assets from {{clientName}}" in To Do, (3) "Setup project folder for {{clientName}}" in To Do, (4) "Create initial {{projectType}} proposal for {{clientName}}" in Backlog. Set all as high priority.',
      modelTier: 'conversation',
      dependsOn: ['check_existing'],
      outputSchema: {
        taskIds: 'string[] - created task IDs',
        taskCount: 'number - number of tasks created',
      },
    },
    {
      key: 'financial_setup',
      type: 'agent',
      label: 'Financial Setup',
      description: 'Finance reviews the client value and sets up tracking',
      agentRole: 'finance',
      prompt: 'New client "{{clientName}}" is being onboarded with an estimated project value of {{projectValue}}. (1) Note this as a new revenue source, (2) Check if there are any financial prerequisites (deposits, contracts), (3) Recommend invoicing schedule based on project type: {{projectType}}.',
      modelTier: 'conversation',
      dependsOn: ['check_existing'],
      outputSchema: {
        invoicingSchedule: 'string - recommended schedule',
        depositRequired: 'boolean - whether deposit is needed',
        financialNotes: 'string - any financial setup notes',
      },
    },
    {
      key: 'draft_welcome',
      type: 'agent',
      label: 'Draft Welcome Email',
      description: 'Comms drafts a welcome email to the new client',
      agentRole: 'comms',
      prompt: 'Draft a warm, professional welcome email to "{{clientName}}" at {{contactEmail}}. Include: (1) Welcome and excitement about working together, (2) Brief overview of next steps (from the tasks created), (3) Request for brand assets and access credentials, (4) Suggest scheduling a kickoff call. Keep it under 200 words.',
      modelTier: 'conversation',
      dependsOn: ['setup_project', 'financial_setup'],
      requiresApproval: true,
      outputSchema: {
        emailSubject: 'string - welcome email subject',
        emailBody: 'string - welcome email body',
      },
    },
    {
      key: 'create_summary',
      type: 'agent',
      label: 'Onboarding Summary',
      description: 'Coordinator creates a summary of all onboarding actions',
      agentRole: 'coordinator',
      prompt: 'Summarize all onboarding actions completed for "{{clientName}}": tasks created, financial setup, welcome email status. List any items still pending or requiring follow-up.',
      modelTier: 'classification',
      dependsOn: ['create_contact', 'setup_project', 'financial_setup', 'draft_welcome'],
      outputSchema: {
        summary: 'string - complete onboarding summary',
        pendingItems: 'string[] - items requiring follow-up',
      },
    },
  ],
  governance: {
    approvalRequired: ['draft_welcome'],
    notifyOnComplete: ['create_summary'],
    costCeiling: 1.50,
    timeoutMs: 300000,
    negotiationModel: 'classification',
  },
}

// ── End of Month ────────────────────────────────────────────────────────────
// "Run end-of-month"
// Generate outstanding invoices, compile hours, produce revenue report

export const END_OF_MONTH: SwarmDefinition = {
  version: '1.0',
  inputSchema: {
    month: {
      type: 'string',
      description: 'Month to process (e.g., "March 2026")',
      required: false,
      default: 'current',
    },
    includeProjected: {
      type: 'boolean',
      description: 'Include projected revenue for next month',
      required: false,
      default: true,
    },
  },
  steps: [
    {
      key: 'scan_outstanding',
      type: 'agent',
      label: 'Scan Outstanding Work',
      description: 'Find all completed work that has not been invoiced',
      agentRole: 'finance',
      prompt: 'Search for all tasks marked as "Done" or "Review" that do not have associated invoices for {{month}}. Also check for any time entries or activities that should be billed. List each piece of uninvoiced work with the client name and estimated value.',
      modelTier: 'conversation',
      dependsOn: [],
      outputSchema: {
        uninvoicedWork: 'object[] - list of work items needing invoices',
        totalUninvoiced: 'number - total estimated value of uninvoiced work',
        clientBreakdown: 'object - uninvoiced amount per client',
      },
    },
    {
      key: 'check_overdue',
      type: 'agent',
      label: 'Check Overdue Invoices',
      description: 'Find all overdue invoices that need follow-up',
      agentRole: 'finance',
      prompt: 'Search for all invoices that are past their due date. For each overdue invoice, note: (1) client name, (2) amount, (3) days overdue, (4) last follow-up date. Prioritize by amount and age.',
      modelTier: 'conversation',
      dependsOn: [],
      outputSchema: {
        overdueInvoices: 'object[] - list of overdue invoices',
        totalOverdue: 'number - total overdue amount',
        criticalOverdue: 'object[] - invoices over 30 days overdue',
      },
    },
    {
      key: 'revenue_summary',
      type: 'agent',
      label: 'Revenue Summary',
      description: 'Compile monthly revenue summary',
      agentRole: 'finance',
      prompt: 'Compile a revenue summary for {{month}}: (1) total invoiced amount, (2) total collected amount, (3) outstanding receivables, (4) new client revenue vs recurring, (5) compare to previous month if data available. {{includeProjected}}',
      modelTier: 'conversation',
      dependsOn: [],
      outputSchema: {
        totalInvoiced: 'number - total invoiced this month',
        totalCollected: 'number - total payments received',
        outstanding: 'number - outstanding receivables',
        monthOverMonth: 'string - comparison to previous month',
      },
    },
    {
      key: 'client_health_check',
      type: 'agent',
      label: 'Client Health Check',
      description: 'Review client relationships for any attention needed',
      agentRole: 'sales',
      prompt: 'Review all active client relationships: (1) any clients with no activity in the last 30 days, (2) any clients with declining engagement, (3) any clients approaching contract renewal, (4) any upsell opportunities. Focus on maintaining relationship health.',
      modelTier: 'conversation',
      dependsOn: [],
      outputSchema: {
        inactiveClients: 'string[] - clients with no recent activity',
        atRiskClients: 'string[] - clients with declining engagement',
        renewals: 'object[] - upcoming contract renewals',
        upsellOpportunities: 'object[] - potential upsell targets',
      },
    },
    {
      key: 'compile_report',
      type: 'agent',
      label: 'Compile Monthly Report',
      description: 'Synthesize all findings into a monthly report',
      agentRole: 'coordinator',
      prompt: 'Compile a comprehensive end-of-month report for {{month}} using all gathered data. Include: (1) Revenue overview, (2) Outstanding invoices and overdue amounts, (3) Uninvoiced work that needs attention, (4) Client health summary, (5) Action items for next month. Format as a clear executive summary.',
      modelTier: 'synthesis',
      dependsOn: ['scan_outstanding', 'check_overdue', 'revenue_summary', 'client_health_check'],
      outputSchema: {
        report: 'string - complete monthly report',
        actionItems: 'string[] - prioritized action items',
        keyMetrics: 'object - key financial metrics',
      },
    },
    {
      key: 'draft_followups',
      type: 'agent',
      label: 'Draft Follow-up Emails',
      description: 'Comms drafts follow-up emails for overdue invoices',
      agentRole: 'comms',
      prompt: 'Based on the overdue invoices identified, draft polite but firm follow-up emails for each overdue client. Vary the tone based on how overdue: (1) 1-7 days: gentle reminder, (2) 8-30 days: firm reminder with payment details, (3) 30+ days: escalation with clear deadline. Queue these for review.',
      modelTier: 'conversation',
      dependsOn: ['check_overdue'],
      requiresApproval: true,
      condition: {
        sourceStep: 'check_overdue',
        path: '$.overdueInvoices',
        operator: 'exists',
        value: true,
      },
      outputSchema: {
        draftedEmails: 'number - count of follow-up emails drafted',
        emailDetails: 'object[] - email subjects and recipients',
      },
    },
  ],
  governance: {
    approvalRequired: ['draft_followups'],
    notifyOnComplete: ['compile_report'],
    costCeiling: 3.00,
    timeoutMs: 600000, // 10 minutes
    negotiationModel: 'conversation',
  },
}

// ── Template Registry ───────────────────────────────────────────────────────

export interface BuiltinTemplate {
  slug: string
  name: string
  description: string
  category: string
  triggerPatterns: string[]
  definition: SwarmDefinition
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    slug: 'pitch-prep',
    name: 'Pitch Preparation',
    description: 'Coordinate Sales, Finance, Research, and Comms to prepare a comprehensive pitch for a client',
    category: 'pitch',
    triggerPatterns: [
      'prepare pitch for',
      'pitch prep for',
      'get ready for.*pitch',
      'prepare for.*meeting with',
      'pitch to',
      'prepare proposal for',
    ],
    definition: PITCH_PREP,
  },
  {
    slug: 'client-onboarding',
    name: 'Client Onboarding',
    description: 'Setup project, create contacts, draft welcome email, and schedule kickoff for a new client',
    category: 'onboarding',
    triggerPatterns: [
      'onboard',
      'new client',
      'set up.*client',
      'setup.*client',
      'welcome.*new.*client',
      'bring on',
    ],
    definition: CLIENT_ONBOARDING,
  },
  {
    slug: 'end-of-month',
    name: 'End of Month',
    description: 'Generate outstanding invoices, review overdue payments, compile revenue report, and check client health',
    category: 'finance',
    triggerPatterns: [
      'end of month',
      'monthly close',
      'month end',
      'eom',
      'monthly report',
      'monthly review',
      'close the month',
    ],
    definition: END_OF_MONTH,
  },
]

/**
 * Find a matching template from trigger patterns.
 * Returns null if no match found.
 */
export function matchTemplate(input: string): BuiltinTemplate | null {
  const lower = input.toLowerCase().trim()

  for (const template of BUILTIN_TEMPLATES) {
    for (const pattern of template.triggerPatterns) {
      try {
        if (new RegExp(pattern, 'i').test(lower)) {
          return template
        }
      } catch {
        // Invalid regex, try simple includes
        if (lower.includes(pattern)) {
          return template
        }
      }
    }
  }

  return null
}
