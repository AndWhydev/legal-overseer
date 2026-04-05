# Specialist Agent Skill Belts — Design Spec

## Problem

BitBit's agent system needs to support dozens of domain skills (34 marketing skills alone, ~30K tokens each). Loading all skills flat into the 48K token context window is impossible (~1M tokens total). The system needs intelligent, per-turn skill selection with deferred loading — mirroring Claude Code's ToolSearch/deferred pattern.

## Solution

A new **skill layer** above the existing tool group system. Skills are files in the codebase, discovered at boot, scored per-turn by a Skill RAG module, confirmed by the Haiku planner, and loaded on demand. Each swarm agent role gets a hard-bounded **skill belt** — a subset of skills it can activate.

## Architecture Decisions

- **Internal skills only** — skills are authored in the codebase, versioned with deploys. No external plugin discovery, no user-authored skills, no hot-reload.
- **Mixed skill types** — some skills are prompt-only (instructions that shape reasoning), others bundle dedicated tool definitions. The system handles both.
- **Two-pass activation** — Skill RAG (fast keyword scoring) produces candidates, Haiku planner (already in the hot path) confirms final selection. No additional LLM calls.
- **Role-scoped belts** — swarm agent roles have explicit `allowedSkills` on their capability boundary. TAOR main agent (direct user chat) has full pool access.
- **Layer on top, not replacement** — existing tool groups are untouched. Skills extend the system, they don't replace tool groups.

## Skill Definition Format

Skills live in `src/skills/`, one directory per skill:

```
src/skills/
  seo-audit/
    skill.json        # metadata
    prompt.md          # full instruction document (the heavy payload)
    tools.ts           # optional — tool definitions only this skill provides
  b2b-copywriting/
    skill.json
    prompt.md          # prompt-only skill, no tools.ts
```

### skill.json Schema

```json
{
  "name": "seo-audit",
  "description": "AI/SEO visibility auditing, schema markup, content optimization",
  "tags": ["seo", "visibility", "schema", "rankings", "search"],
  "triggerKeywords": ["seo", "audit", "visibility", "rankings", "schema markup", "search performance"],
  "roleAffinity": ["operations", "research"],
  "toolGroup": "seo",
  "estimatedTokens": 2800,
  "planGate": "growth"
}
```

Field definitions:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Human-readable skill name |
| `description` | string | yes | One-line description used by Skill RAG and planner |
| `tags` | string[] | yes | Topic tags for RAG scoring |
| `triggerKeywords` | string[] | yes | High-signal keywords that strongly indicate this skill is needed |
| `roleAffinity` | AgentRole[] | yes | Which swarm roles can load this skill |
| `toolGroup` | string | no | If present, skill's tools.ts registers tools into this group |
| `estimatedTokens` | number | yes | Approximate token count of prompt.md for budget planning |
| `planGate` | string | no | Billing plan gate (ties to existing `checkToolPlanGate()`) |

### prompt.md

The heavy payload. Contains domain instructions, guidelines, examples, anti-patterns — everything the model needs to reason well in this domain. Only loaded when the skill is activated for a turn.

### tools.ts (optional)

Exports an array of tool definitions (same `ToolDefinition` interface used in `tools.ts`). These tools are invisible to the system until the skill activates — no deferred listing, no schema cost. They materialize only on skill load.

## Skill Registry

### Interfaces

```typescript
interface SkillIndexEntry {
  id: string                          // directory name, e.g. "seo-audit"
  name: string
  description: string
  tags: string[]
  triggerKeywords: string[]
  roleAffinity: AgentRole[]
  toolGroup?: string
  estimatedTokens: number
  planGate?: string
  promptPath: string                  // absolute path to prompt.md
  toolsPath?: string                  // absolute path to tools.ts (if exists)
}

interface ResolvedSkill {
  entry: SkillIndexEntry
  prompt: string                      // full prompt.md content
  tools?: ToolDefinition[]            // parsed tool definitions (if tools.ts exists)
}

interface SkillRegistry {
  index: SkillIndexEntry[]
  getForRole(role: AgentRole): SkillIndexEntry[]
  getAll(): SkillIndexEntry[]
  resolve(skillId: string): Promise<ResolvedSkill>
}
```

### Discovery

Single `glob('src/skills/*/skill.json')` at server boot. Parses each skill.json, records prompt/tools paths. No hot-reloading — skills change with deploys.

### Index Cost

~50 skills x ~20 tokens per entry = ~1,000 tokens. The index never enters model context — only Skill RAG reads it in-process.

### Deferred Resolution

`resolve(skillId)` reads `prompt.md` from disk, dynamically imports `tools.ts` if present. Results are LRU-cached (skills don't change at runtime).

## Skill RAG

New module `src/lib/skills/skill-rag.ts` mirroring `tool-rag.ts`.

### Scoring Algorithm

Per-turn, against the user message:

1. Tokenize message into lowercase words
2. **Name match**: Skill ID parts in message (+3 each)
3. **Tag match**: Skill tags in message (+2 each)
4. **Trigger keyword match**: Exact keyword hits (+3 each)
5. **Description overlap**: Word overlap normalized by description length (+1 per word, capped)
6. **Bigram match**: Two-word phrases matching skill name or tags (+4)

### Role Filtering

If running inside a swarm agent, filter index to `getForRole(role)` before scoring. TAOR main agent scores the full pool via `getAll()`.

### Output

Top 5 candidates (default, configurable via `MAX_SKILL_CANDIDATES`), sorted by score. Each candidate carries `estimatedTokens`.

### Token Budget Pre-check

Before passing candidates to the planner, sum `estimatedTokens`. If total exceeds the skill tier budget (8,000 tokens), drop lowest-scoring candidates until it fits. Prevents the planner from selecting skills that won't fit.

### Performance

Pure string matching on an in-memory array of ~50 entries. Sub-millisecond. No LLM call.

## Planner Integration

The Haiku planner (already returning `{ stages, toolGroups, complexity }`) gains a `skills` field.

### Planner Prompt Addition

Appended to `PLANNER_SYSTEM`:

```
Also select which skills to activate for this request.
You will be given a list of candidate skills with descriptions.
Select 0-2 skills that are most relevant. Select 0 if none apply.

Output field:
- "skills": array of skill IDs from the candidates (e.g., ["seo-audit"])
```

### What the Planner Sees

Only candidate skill IDs + descriptions from Skill RAG — NOT full prompt content. Keeps the planner call cheap.

### Schema Changes

- `PlanOutput` interface: add `skills: string[]`
- `PlanOutputSchema`: add `skills: z.array(z.string()).describe('Skill IDs to activate from candidates, 0-2 max')`
- Both `generatePlanStructured()` and `generatePlanLegacy()` extract and return skills
- Fallback: `skills: []`
- Plan gate check: after planner selects, verify each against `planGate` via existing `checkToolPlanGate()`. Drop gated skills.

## Context Assembly Integration

### New Tier: skill_prompts

Inserted between system prompt and session history tiers. Skill instructions shape reasoning like an extended system prompt, so they must be seen before conversation history.

### Token Budget

Dedicated **8,000 token** allocation for the skill tier, carved from the 48K total. Follows existing `TokenBudgetManager` per-tier allocation pattern with min/max.

### Trimming Strategy

If selected skills exceed 8K:
1. Drop lowest-scoring skill (by Skill RAG score)
2. Single skills exceeding 8K: truncate prompt (rare if skills are well-authored)

### Tool Registration

When a skill with `tools.ts` activates:
1. Dynamically imported via `resolve()`
2. Tools added to the eager tool set for this turn (merged into `getAgentTools()` output)
3. Tool group added to planner's `toolGroups` so tool RAG can score them

Skill tools are **invisible** until activation — zero cost when inactive.

### Model Context Format

```
### Active Skills
The following domain skills are active for this turn:

#### SEO Audit
[full prompt.md content]
```

## Swarm Capability Boundaries

### Extended Interface

```typescript
interface CapabilityBoundary {
  allowedToolGroups: ToolGroup[]
  allowedSkills?: string[]           // skill IDs this role can activate
  deniedTools?: string[]
  approvalRequired?: string[]
}
```

### Behavior

- `allowedSkills` defined: Skill RAG filters to only those skills before scoring
- `allowedSkills` undefined/empty: no skills available to that role (safe default)
- TAOR main agent: no capability boundary, full skill pool access

### Example Role Belts

```typescript
sales:      { allowedSkills: ['b2b-copywriting', 'competitor-analysis', 'pricing-strategy'] }
finance:    { allowedSkills: ['stripe-billing', 'invoice-guidelines'] }
comms:      { allowedSkills: ['b2b-copywriting', 'email-outreach'] }
research:   { allowedSkills: ['seo-audit', 'competitor-analysis', 'market-research'] }
operations: { allowedSkills: ['seo-audit', 'content-calendar', 'tender-response'] }
coordinator: { allowedSkills: [] }  // delegates, doesn't execute domain work
```

## Per-Turn Flow

```
User message arrives
    |
    v
Skill RAG scores index against message
  - Filters by role (if swarm agent) or full pool (if TAOR main)
  - Returns top 3-5 candidates with token estimates
  - Pre-checks token budget, drops overflow
    |
    v
Haiku Planner (already in hot path)
  - Receives candidate skill IDs + descriptions
  - Returns: { stages, toolGroups, complexity, skills: ['seo-audit'] }
    |
    v
Skill Resolution
  - resolve() loads prompt.md + tools.ts for selected skills
  - LRU cache hit on repeated activations
  - Plan gate check drops unauthorized skills
    |
    v
Context Assembly
  - Skill prompts injected into skill_prompts tier (8K budget)
  - Skill tools merged into eager tool set for this turn
  - Tool RAG scores all tools (including newly registered skill tools)
    |
    v
TAOR Loop executes with skill-enriched context
```

## File Map

### New Files

```
src/skills/                                        # skill directories (infrastructure only — actual skills authored separately)
src/lib/skills/types.ts                            # SkillIndexEntry, ResolvedSkill, SkillRegistry interfaces
src/lib/skills/registry.ts                         # filesystem discovery, index building, resolve(), LRU cache
src/lib/skills/skill-rag.ts                        # per-turn skill scoring (mirrors tool-rag.ts pattern)
```

### Modified Files

```
src/lib/agent/planner.ts                           # add skills to PlanOutput, PlanOutputSchema, PLANNER_SYSTEM, both parsers
src/lib/agent/engine/taor-loop.ts                  # Skill RAG candidates -> planner, resolve selected, register tools
src/lib/context-assembly/context-assembler.ts      # new skill_prompts tier
src/lib/context-assembly/token-budget-manager.ts   # add skill tier allocation (8K default)
src/lib/swarm/types.ts                             # add allowedSkills to CapabilityBoundary
src/lib/swarm/agent.ts                             # pass allowedSkills to Skill RAG when executing swarm steps
```

## Not In Scope

- **Authoring actual skills** — this builds the infrastructure. Skills are a separate effort.
- **UI for skill management** — skills are files, deployed with code.
- **Skill versioning / hot-reload** — skills change with deploys, not at runtime.
- **External plugin discovery** — internal skills only for now. Architecture doesn't preclude adding this later.
- **Skill-to-skill dependencies** — each skill is independent. If two skills need to compose, that's a design problem in the skills themselves.

## Estimated Size

~400-500 lines of new code across 4 new files, ~100 lines of modifications across 6 existing files.
