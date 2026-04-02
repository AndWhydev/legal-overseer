# Workflow Template Library

Introduce reusable templates for common SMB operations (lead intake, support triage, renewal reminders, handoff workflows). Include per-deployment customization fields and safe defaults.

## Rationale
Template-driven setup helps small teams deploy automation faster across different contexts, supporting the multi-deployment differentiator.

## User Stories
- As an operations manager, I want prebuilt workflows so that I can launch automation quickly.
- As a deployment owner, I want client-specific configuration so that each environment matches business rules.

## Acceptance Criteria
- [ ] Users can create a workflow from a template and complete required configuration fields.
- [ ] At least five production-ready templates are available with documentation and defaults.
- [ ] Template instances can be versioned and updated without breaking existing active runs.
