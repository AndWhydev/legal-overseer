-- 141_swarm_templates_seed.sql
-- Seed built-in swarm templates: Pitch Prep, Client Onboard, End-of-Month

INSERT INTO swarm_templates (slug, name, description, category, dag, param_schema, trigger_patterns, is_builtin) VALUES

-- ==========================================================================
-- Template 1: Pitch Prep
-- ==========================================================================
(
  'pitch-prep',
  'Pitch Preparation',
  'Coordinate sales, finance, and comms to prepare for a client pitch. Researches the prospect, checks financial capacity, drafts talking points, and prepares a proposal outline.',
  'sales',
  '{
    "agents": [
      {"id": "sales", "agent_type": "sales", "label": "Sales Research", "model_tier": "sonnet"},
      {"id": "finance", "agent_type": "finance", "label": "Financial Check", "model_tier": "haiku"},
      {"id": "comms", "agent_type": "comms", "label": "Comms Prep", "model_tier": "sonnet"}
    ],
    "steps": [
      {
        "step_id": "research_prospect",
        "agent_id": "sales",
        "name": "Research Prospect",
        "step_type": "sequential",
        "depends_on": [],
        "expected_output": ["prospect_profile", "similar_projects", "pricing_history"],
        "prompt_template": "Research the prospect {{contact_name}}. Find their company, industry, size, past interactions, and similar projects we have done."
      },
      {
        "step_id": "check_capacity",
        "agent_id": "finance",
        "name": "Check Financial Capacity",
        "step_type": "parallel",
        "depends_on": [],
        "expected_output": ["current_workload", "available_capacity", "financial_health"],
        "prompt_template": "Check our current financial capacity: active projects, outstanding invoices, team availability. Can we take on new work?"
      },
      {
        "step_id": "draft_talking_points",
        "agent_id": "comms",
        "name": "Draft Talking Points",
        "step_type": "sequential",
        "depends_on": ["research_prospect", "check_capacity"],
        "input_mapping": {
          "prospect": "research_prospect.prospect_profile",
          "capacity": "check_capacity.available_capacity"
        },
        "expected_output": ["talking_points", "proposal_outline", "risk_flags"],
        "prompt_template": "Draft talking points for the pitch to {{contact_name}}. Consider our capacity assessment and the prospect research."
      }
    ],
    "config": {
      "max_duration_seconds": 300,
      "budget_cents": 50,
      "allow_parallel": true,
      "conflict_resolution": "coordinator"
    }
  }'::jsonb,
  '{
    "contact_name": {"type": "string", "description": "Name of the prospect/client", "required": true},
    "pitch_date": {"type": "string", "description": "When the pitch is scheduled", "required": false},
    "service_type": {"type": "string", "description": "Type of service being pitched", "required": false}
  }'::jsonb,
  ARRAY['prepare for pitch', 'pitch prep', 'get ready for meeting with', 'prepare proposal for', 'pitch to'],
  true
),

-- ==========================================================================
-- Template 2: Client Onboard
-- ==========================================================================
(
  'client-onboard',
  'Client Onboarding',
  'Automate new client onboarding: create project, set up tasks, send welcome email, generate first invoice, and schedule kickoff.',
  'operations',
  '{
    "agents": [
      {"id": "sales", "agent_type": "sales", "label": "Project Setup", "model_tier": "sonnet"},
      {"id": "comms", "agent_type": "comms", "label": "Welcome Comms", "model_tier": "sonnet"},
      {"id": "finance", "agent_type": "finance", "label": "Billing Setup", "model_tier": "haiku"}
    ],
    "steps": [
      {
        "step_id": "create_project",
        "agent_id": "sales",
        "name": "Create Project & Tasks",
        "step_type": "sequential",
        "depends_on": [],
        "expected_output": ["project_id", "task_ids", "timeline"],
        "prompt_template": "Set up the project for new client {{contact_name}}. Create the project, add initial tasks (kickoff, discovery, first deliverable), and set timeline."
      },
      {
        "step_id": "send_welcome",
        "agent_id": "comms",
        "name": "Send Welcome Email",
        "step_type": "sequential",
        "depends_on": ["create_project"],
        "input_mapping": {
          "project": "create_project.project_id",
          "timeline": "create_project.timeline"
        },
        "expected_output": ["email_sent", "message_id"],
        "prompt_template": "Draft and send a welcome email to {{contact_name}} with project details and next steps."
      },
      {
        "step_id": "setup_billing",
        "agent_id": "finance",
        "name": "Set Up Billing",
        "step_type": "parallel",
        "depends_on": ["create_project"],
        "input_mapping": {
          "project": "create_project.project_id"
        },
        "expected_output": ["invoice_id", "billing_schedule"],
        "prompt_template": "Set up billing for {{contact_name}}: create initial invoice or deposit request based on the project scope."
      }
    ],
    "config": {
      "max_duration_seconds": 300,
      "budget_cents": 40,
      "allow_parallel": true,
      "conflict_resolution": "coordinator"
    }
  }'::jsonb,
  '{
    "contact_name": {"type": "string", "description": "Name of the new client", "required": true},
    "service_type": {"type": "string", "description": "Type of service purchased", "required": false},
    "budget": {"type": "string", "description": "Agreed budget or rate", "required": false}
  }'::jsonb,
  ARRAY['onboard', 'new client', 'client onboarding', 'set up new client', 'welcome new client', 'start onboarding'],
  true
),

-- ==========================================================================
-- Template 3: End-of-Month
-- ==========================================================================
(
  'end-of-month',
  'End-of-Month Review',
  'Monthly close-out: generate financial summary, send outstanding invoice reminders, produce client health report, and plan next month priorities.',
  'finance',
  '{
    "agents": [
      {"id": "finance", "agent_type": "finance", "label": "Financial Summary", "model_tier": "sonnet"},
      {"id": "comms", "agent_type": "comms", "label": "Invoice Reminders", "model_tier": "haiku"},
      {"id": "sales", "agent_type": "sales", "label": "Pipeline Review", "model_tier": "sonnet"}
    ],
    "steps": [
      {
        "step_id": "financial_summary",
        "agent_id": "finance",
        "name": "Generate Financial Summary",
        "step_type": "sequential",
        "depends_on": [],
        "expected_output": ["revenue", "expenses", "outstanding", "cash_flow"],
        "prompt_template": "Generate end-of-month financial summary: total invoiced, received, outstanding, and cash flow projection for next month."
      },
      {
        "step_id": "invoice_reminders",
        "agent_id": "comms",
        "name": "Send Invoice Reminders",
        "step_type": "parallel",
        "depends_on": [],
        "expected_output": ["reminders_sent", "overdue_clients"],
        "prompt_template": "Identify overdue invoices and send appropriate reminder emails. Use escalating tone based on how overdue."
      },
      {
        "step_id": "pipeline_review",
        "agent_id": "sales",
        "name": "Review Sales Pipeline",
        "step_type": "parallel",
        "depends_on": [],
        "expected_output": ["active_leads", "stale_proposals", "conversion_rate", "next_month_priorities"],
        "prompt_template": "Review the sales pipeline: active leads, stale proposals needing follow-up, conversion rates, and priorities for next month."
      },
      {
        "step_id": "compile_report",
        "agent_id": "finance",
        "name": "Compile Monthly Report",
        "step_type": "sequential",
        "depends_on": ["financial_summary", "invoice_reminders", "pipeline_review"],
        "input_mapping": {
          "financials": "financial_summary",
          "reminders": "invoice_reminders.reminders_sent",
          "pipeline": "pipeline_review"
        },
        "expected_output": ["monthly_report", "action_items"],
        "prompt_template": "Compile the end-of-month report combining financial summary, invoice reminder results, and pipeline review. List top 5 action items for next month."
      }
    ],
    "config": {
      "max_duration_seconds": 600,
      "budget_cents": 80,
      "allow_parallel": true,
      "conflict_resolution": "coordinator"
    }
  }'::jsonb,
  '{
    "month": {"type": "string", "description": "Month to review (defaults to current)", "required": false, "default": "current"},
    "include_projections": {"type": "boolean", "description": "Include next month projections", "required": false, "default": true}
  }'::jsonb,
  ARRAY['end of month', 'monthly review', 'month end', 'monthly close', 'monthly report', 'eom review'],
  true
);
