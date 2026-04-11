# Specialist Agent Skill Belts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deferred skill loading system where skills (prompt documents + optional tools) are discovered at boot, scored per-turn by a Skill RAG module, confirmed by the Haiku planner, and injected into context only when activated — with per-role skill belts for swarm agents.

**Architecture:** Skills are directories under `src/skills/` with `skill.json` metadata and `prompt.md` content. A SkillRegistry discovers them at boot and builds a lightweight in-memory index. Skill RAG scores the index per-turn and feeds candidates to the existing Haiku planner, which selects 0-2 skills. Selected skills are resolved (prompt loaded, tools registered) and injected into context assembly as a new tier. Swarm agents get `allowedSkills` on their capability boundary.

**Tech Stack:** TypeScript, Zod (existing), glob (Node.js built-in), existing planner/context-assembly/tool-rag patterns.

**IMPORTANT CONTEXT:** The working copy at `/tmp/bitbit-push/personal-assistant/` is used for development. Run all commands from there.

---

## File Structure

### New Files
```
src/lib/skills/types.ts               — SkillIndexEntry, ResolvedSkill interfaces
src/lib/skills/registry.ts            — filesystem discovery, index building, resolve() with LRU cache
src/lib/skills/skill-rag.ts           — per-turn skill scoring (mirrors tool-rag.ts)
src/skills/.gitkeep                   — empty skills directory (actual skills authored separately)
```

### Modified Files
```
src/lib/agent/planner.ts              — add skills to PlanOutput, PlanOutputSchema, PLANNER_SYSTEM, both parsers
src/lib/agent/engine/taor-loop.ts     — wire Skill RAG → planner → resolve → context + tool registration
src/lib/context-assembly/context-assembler.ts — new skill_prompts tier in system prompt
src/lib/conversation/types.ts         — add skillPrompts to TokenAllocation
src/lib/context-assembly/token-budget-manager.ts — add skillPrompts allocation
src/lib/swarm/types.ts                — add allowedSkills to CapabilityBoundary + DEFAULT_CAPABILITIES
src/lib/swarm/agent.ts                — pass role to skill loading
```

---

### Task 1: Skill Types & Registry

**Files:**
- Create: `src/lib/skills/types.ts`
- Create: `src/lib/skills/registry.ts`
- Create: `src/skills/.gitkeep`

- [ ] **Step 1: Create the types file**

Create `src/lib/skills/types.ts`:

```typescript
/**
 * Skill Belt Type System
 *
 * Skills are domain-specific instruction documents (prompt.md) with optional
 * tool definitions (tools.ts). They are discovered at boot from src/skills/
 * and loaded on-demand when activated by Skill RAG + planner.
 */

import type { AgentRole } from '@/lib/swarm/types'

/**
 * Lightweight index entry — always in memory, never sent to the model.
 * ~20 tokens per entry × 50 skills = ~1,000 tokens total index cost.
 */
export interface SkillIndexEntry {
  /** Directory name, e.g. "seo-audit" */
  id: string
  /** Human-readable skill name */
  name: string
  /** One-line description for Skill RAG and planner candidate display */
  description: string
  /** Topic tags for RAG scoring */
  tags: string[]
  /** High-signal keywords that strongly indicate this skill is needed */
  triggerKeywords: string[]
  /** Which swarm roles can load this skill */
  roleAffinity: AgentRole[]
  /** If present, skill's tools.ts registers tools into this tool group */
  toolGroup?: string
  /** Approximate token count of prompt.md for budget planning */
  estimatedTokens: number
  /** Optional billing plan gate (ties to existing checkToolPlanGate) */
  planGate?: string
  /** Absolute path to prompt.md */
  promptPath: string
  /** Absolute path to tools.ts (if exists) */
  toolsPath?: string
}

/**
 * Fully resolved skill — loaded on-demand when activated for a turn.
 * LRU-cached since skills don't change at runtime.
 */
export interface ResolvedSkill {
  entry: SkillIndexEntry
  /** Full prompt.md content */
  prompt: string
  /** Parsed tool definitions from tools.ts (if present) */
  tools?: Array<{
    name: string
    description: string
    input_schema: Record<string, unknown>
  }>
}
```

- [ ] **Step 2: Create the registry**

Create `src/lib/skills/registry.ts`:

```typescript
/**
 * Skill Registry — filesystem discovery and deferred resolution.
 *
 * Boot: scans src/skills/\*\/skill.json, builds in-memory index.
 * Per-turn: Skill RAG scores index, planner confirms, resolve() loads content.
 */

import { readFileSync, existsSync } from 'fs'
import { join, resolve as resolvePath } from 'path'
import { glob } from 'glob'
import { logger } from '@/lib/core/logger'
import type { AgentRole } from '@/lib/swarm/types'
import type { SkillIndexEntry, ResolvedSkill } from './types'

// ---------------------------------------------------------------------------
// LRU Cache for resolved skills (skills don't change at runtime)
// ---------------------------------------------------------------------------

const MAX_CACHE_SIZE = 20
const resolveCache = new Map<string, ResolvedSkill>()

function cacheGet(id: string): ResolvedSkill | undefined {
  const entry = resolveCache.get(id)
  if (entry) {
    // Move to end (most recently used)
    resolveCache.delete(id)
    resolveCache.set(id, entry)
  }
  return entry
}

function cacheSet(id: string, skill: ResolvedSkill): void {
  if (resolveCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest (first key)
    const oldest = resolveCache.keys().next().value
    if (oldest) resolveCache.delete(oldest)
  }
  resolveCache.set(id, skill)
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

let skillIndex: SkillIndexEntry[] = []
let initialized = false

/**
 * Discover all skills from src/skills/\*\/skill.json at boot.
 * Call once at server startup. Safe to call multiple times (idempotent).
 */
export async function initializeSkillRegistry(skillsDir?: string): Promise<void> {
  const baseDir = skillsDir ?? resolvePath(process.cwd(), 'src/skills')

  if (!existsSync(baseDir)) {
    logger.info('[skill-registry] Skills directory not found, no skills loaded', { baseDir })
    skillIndex = []
    initialized = true
    return
  }

  const pattern = join(baseDir, '*/skill.json')
  const files = await glob(pattern)

  const entries: SkillIndexEntry[] = []

  for (const filePath of files) {
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const json = JSON.parse(raw) as Record<string, unknown>

      const dirPath = filePath.replace(/\/skill\.json$/, '')
      const id = dirPath.split('/').pop()!

      const promptPath = join(dirPath, 'prompt.md')
      const toolsPath = join(dirPath, 'tools.ts')

      if (!existsSync(promptPath)) {
        logger.warn('[skill-registry] Skill missing prompt.md, skipping', { id })
        continue
      }

      const entry: SkillIndexEntry = {
        id,
        name: String(json.name ?? id),
        description: String(json.description ?? ''),
        tags: Array.isArray(json.tags) ? json.tags.map(String) : [],
        triggerKeywords: Array.isArray(json.triggerKeywords) ? json.triggerKeywords.map(String) : [],
        roleAffinity: Array.isArray(json.roleAffinity) ? json.roleAffinity as AgentRole[] : [],
        toolGroup: typeof json.toolGroup === 'string' ? json.toolGroup : undefined,
        estimatedTokens: typeof json.estimatedTokens === 'number' ? json.estimatedTokens : 1000,
        planGate: typeof json.planGate === 'string' ? json.planGate : undefined,
        promptPath,
        toolsPath: existsSync(toolsPath) ? toolsPath : undefined,
      }

      entries.push(entry)
    } catch (err) {
      logger.error('[skill-registry] Failed to parse skill.json', {
        file: filePath,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  skillIndex = entries
  initialized = true
  resolveCache.clear()

  logger.info('[skill-registry] Initialized', { skillCount: entries.length })
}

/**
 * Get all skills (for TAOR main agent — full pool access).
 */
export function getAllSkills(): SkillIndexEntry[] {
  if (!initialized) {
    logger.warn('[skill-registry] Accessed before initialization')
    return []
  }
  return skillIndex
}

/**
 * Get skills filtered by role affinity (for swarm agents).
 */
export function getSkillsForRole(role: AgentRole): SkillIndexEntry[] {
  return skillIndex.filter(s => s.roleAffinity.includes(role))
}

/**
 * Resolve a skill by ID — loads prompt.md content and optional tools.
 * Results are LRU-cached.
 */
export async function resolveSkill(skillId: string): Promise<ResolvedSkill | null> {
  const cached = cacheGet(skillId)
  if (cached) return cached

  const entry = skillIndex.find(s => s.id === skillId)
  if (!entry) return null

  try {
    const prompt = readFileSync(entry.promptPath, 'utf-8')

    let tools: ResolvedSkill['tools']
    if (entry.toolsPath) {
      try {
        const toolModule = await import(entry.toolsPath)
        tools = toolModule.default ?? toolModule.tools
      } catch (err) {
        logger.warn('[skill-registry] Failed to import tools.ts', {
          skillId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const resolved: ResolvedSkill = { entry, prompt, tools }
    cacheSet(skillId, resolved)
    return resolved
  } catch (err) {
    logger.error('[skill-registry] Failed to resolve skill', {
      skillId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
```

- [ ] **Step 3: Create empty skills directory**

```bash
mkdir -p /tmp/bitbit-push/personal-assistant/src/skills
touch /tmp/bitbit-push/personal-assistant/src/skills/.gitkeep
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit 2>&1 | grep -i "skill" | head -10
```

Expected: no errors in skills/ files. May see errors in files that don't yet import skills (that's fine — wired in later tasks).

- [ ] **Step 5: Commit**

```bash
cd /tmp/bitbit-push
git add personal-assistant/src/lib/skills/types.ts personal-assistant/src/lib/skills/registry.ts personal-assistant/src/skills/.gitkeep
git commit -m "feat: add skill registry with filesystem discovery and LRU-cached resolution"
```

---

### Task 2: Skill RAG

**Files:**
- Create: `src/lib/skills/skill-rag.ts`

- [ ] **Step 1: Create the Skill RAG module**

Create `src/lib/skills/skill-rag.ts`:

```typescript
/**
 * Skill RAG — per-turn skill selection based on message relevance.
 *
 * Mirrors tool-rag.ts pattern: tokenize message, score each skill by
 * keyword/tag/description overlap, return top candidates with token estimates.
 *
 * Performance: pure string matching on ~50 in-memory entries. Sub-millisecond.
 */

import type { SkillIndexEntry } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of skill candidates to surface to the planner */
const MAX_SKILL_CANDIDATES = 5

/** Maximum total estimated tokens for all candidates (budget pre-check) */
const MAX_CANDIDATE_TOKENS = 8000

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'to', 'of', 'in', 'for', 'on', 'and',
  'or', 'but', 'not', 'with', 'this', 'that', 'from', 'by', 'at', 'as',
  'be', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'can', 'may', 'i', 'my',
  'me', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'its',
  'what', 'when', 'where', 'how', 'who', 'which', 'if', 'then', 'so',
  'up', 'out', 'about', 'just', 'get', 'got', 'also', 'some', 'any',
  'all', 'very', 'too', 'more', 'most', 'much', 'many', 'than', 'no',
  'yes', 'please', 'thanks', 'hi', 'hey', 'hello',
])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillRAGResult {
  /** Top skill candidates to pass to the planner */
  candidates: SkillCandidate[]
  /** Scoring details for observability */
  scores: Record<string, number>
}

export interface SkillCandidate {
  id: string
  name: string
  description: string
  estimatedTokens: number
  score: number
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Score and select the most relevant skills for a given user message.
 *
 * @param message     - The user's message text
 * @param skillIndex  - Skill entries to score (pre-filtered by role if swarm agent)
 * @param maxCandidates - Maximum candidates to return (default: 5)
 */
export function selectRelevantSkills(
  message: string,
  skillIndex: SkillIndexEntry[],
  maxCandidates: number = MAX_SKILL_CANDIDATES,
): SkillRAGResult {
  if (skillIndex.length === 0) {
    return { candidates: [], scores: {} }
  }

  const messageWords = tokenize(message)
  const messageWordSet = new Set(messageWords)
  const messageLower = message.toLowerCase()

  const scored: Array<{ entry: SkillIndexEntry; score: number }> = []
  const scores: Record<string, number> = {}

  for (const entry of skillIndex) {
    const score = scoreSkill(entry, messageWords, messageWordSet, messageLower)
    scores[entry.id] = score
    if (score > 0) {
      scored.push({ entry, score })
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  // Take top N, then enforce token budget
  const candidates: SkillCandidate[] = []
  let totalTokens = 0

  for (const { entry, score } of scored.slice(0, maxCandidates)) {
    if (totalTokens + entry.estimatedTokens > MAX_CANDIDATE_TOKENS) continue
    candidates.push({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      estimatedTokens: entry.estimatedTokens,
      score,
    })
    totalTokens += entry.estimatedTokens
  }

  return { candidates, scores }
}

// ---------------------------------------------------------------------------
// Scoring internals
// ---------------------------------------------------------------------------

function scoreSkill(
  entry: SkillIndexEntry,
  messageWords: string[],
  messageWordSet: Set<string>,
  messageLower: string,
): number {
  let score = 0

  // 1. Name match — skill ID parts in the message (+3 each)
  const nameWords = entry.id.split('-')
  for (const word of nameWords) {
    if (word.length > 2 && messageLower.includes(word)) {
      score += 3
    }
  }

  // 2. Tag match — topic tags in the message (+2 each)
  for (const tag of entry.tags) {
    if (messageWordSet.has(tag.toLowerCase()) || messageLower.includes(tag.toLowerCase())) {
      score += 2
    }
  }

  // 3. Trigger keyword match — high-signal exact hits (+3 each)
  for (const keyword of entry.triggerKeywords) {
    if (messageLower.includes(keyword.toLowerCase())) {
      score += 3
    }
  }

  // 4. Description overlap — word overlap normalized by length (+1 per word, capped)
  const descWords = tokenize(entry.description)
  let descOverlap = 0
  for (const word of descWords) {
    if (messageWordSet.has(word)) {
      descOverlap++
    }
  }
  if (descWords.length > 0) {
    score += (descOverlap / descWords.length) * 2
  }

  // 5. Bigram match — two-word phrases matching skill name (+4)
  if (messageWords.length >= 2) {
    const nameBigram = entry.id.replace(/-/g, ' ')
    for (let i = 0; i < messageWords.length - 1; i++) {
      const bigram = `${messageWords[i]} ${messageWords[i + 1]}`
      if (nameBigram.includes(bigram)) {
        score += 4
      }
    }
  }

  return score
}

/**
 * Tokenize text into lowercase words, filtering stop words and short tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit 2>&1 | grep -i "skill-rag" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /tmp/bitbit-push
git add personal-assistant/src/lib/skills/skill-rag.ts
git commit -m "feat: add Skill RAG module for per-turn skill selection"
```

---

### Task 3: Planner Integration

**Files:**
- Modify: `src/lib/agent/planner.ts`

- [ ] **Step 1: Add skills to PlanOutput interface**

In `src/lib/agent/planner.ts`, find the `PlanOutput` interface (line 7) and add `skills`:

```typescript
export interface PlanOutput {
  stages: PlanStage[]
  toolGroups: ToolGroup[]
  complexity: 'low' | 'medium' | 'high'
  skills: string[]
}
```

- [ ] **Step 2: Add skills to PlanOutputSchema**

Find `PlanOutputSchema` (line 72) and add the skills field:

```typescript
const PlanOutputSchema = z.object({
  stages: z.array(PlanStageSchema).min(1).max(4)
    .describe('Array of 1-4 execution stages, focused on what matters to the user'),
  toolGroups: z.array(z.string())
    .describe('Tool groups needed (do NOT include "core" — it is always added). Available: memory, channel, web, comms, agentic'),
  complexity: z.enum(['low', 'medium', 'high'])
    .describe('Overall request complexity: low=greeting/simple lookup, medium=standard 1-2 step, high=multi-step research/financial/cross-entity'),
  skills: z.array(z.string())
    .describe('Skill IDs to activate from candidates, 0-2 max. Select [] if no skill candidates provided or none apply.'),
})
```

- [ ] **Step 3: Add skill selection instructions to PLANNER_SYSTEM**

Find the `PLANNER_SYSTEM` string (line 86). Before `Output ONLY the JSON object`, add:

```
Also select which skills to activate for this request.
You may be given a list of candidate skills with descriptions.
Select 0-2 skills that are most relevant. Select [] if no candidates provided or none apply.
```

And update the output description to include skills:

Replace:
```
Output a JSON object (not array) with three fields:
- "stages": the array of stage objects as described above
- "toolGroups": array of group names (do NOT include "core" — it is always added)
- "complexity": one of "low", "medium", "high"
```

With:
```
Output a JSON object (not array) with four fields:
- "stages": the array of stage objects as described above
- "toolGroups": array of group names (do NOT include "core" — it is always added)
- "complexity": one of "low", "medium", "high"
- "skills": array of skill IDs from the candidates (e.g., ["seo-audit"]). Use [] if none.
```

- [ ] **Step 4: Add optional skillCandidates parameter to generatePlan**

Update the `generatePlan` function signature (line 128) to accept optional skill candidates:

```typescript
export async function generatePlan(
  message: string,
  entityContext: string,
  toolNames: string[],
  skillCandidates?: Array<{ id: string; description: string }>,
): Promise<PlanOutput> {
  if (USE_STRUCTURED_PLANNER) {
    return generatePlanStructured(message, entityContext, toolNames, skillCandidates)
  }
  return generatePlanLegacy(message, entityContext, toolNames, skillCandidates)
}
```

- [ ] **Step 5: Update generatePlanStructured to include skills**

Update `generatePlanStructured` signature (line 143) to accept skillCandidates:

```typescript
async function generatePlanStructured(
  message: string,
  entityContext: string,
  toolNames: string[],
  skillCandidates?: Array<{ id: string; description: string }>,
): Promise<PlanOutput> {
```

After the `userPrompt` construction (line 151), append skill candidates if present:

```typescript
  let userPrompt = entityContext
    ? `User request: "${message}"\n\nKnown context:\n${entityContext}`
    : `User request: "${message}"`

  if (skillCandidates && skillCandidates.length > 0) {
    userPrompt += '\n\nCandidate skills:\n' + skillCandidates
      .map(s => `- ${s.id}: ${s.description}`)
      .join('\n')
  }
```

Update the return statement (line 187) to include skills:

```typescript
    return { stages, toolGroups, complexity: data.complexity ?? 'medium', skills: data.skills ?? [] }
```

Update the catch fallback (line 190) to include skills:

```typescript
    return { stages: [], toolGroups: [], complexity: 'medium' as const, skills: [] }
```

- [ ] **Step 6: Update generatePlanLegacy to include skills**

Update `generatePlanLegacy` signature (line 198) to accept skillCandidates:

```typescript
async function generatePlanLegacy(
  message: string,
  entityContext: string,
  toolNames: string[],
  skillCandidates?: Array<{ id: string; description: string }>,
): Promise<PlanOutput> {
```

After the `userPrompt` construction (line 206), append skill candidates:

```typescript
  let userPrompt = entityContext
    ? `User request: "${message}"\n\nKnown context:\n${entityContext}`
    : `User request: "${message}"`

  if (skillCandidates && skillCandidates.length > 0) {
    userPrompt += '\n\nCandidate skills:\n' + skillCandidates
      .map(s => `- ${s.id}: ${s.description}`)
      .join('\n')
  }
```

Before the final `return { stages, toolGroups, complexity }` (line 266), extract skills:

```typescript
    // Extract skills with fallback
    const rawSkills = typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Record<string, unknown>).skills)
      ? ((parsed as Record<string, unknown>).skills as unknown[]).filter((s): s is string => typeof s === 'string')
      : []

    return { stages, toolGroups, complexity, skills: rawSkills }
```

Update all fallback returns in the legacy planner to include `skills: []`:
- Line 240: `return { stages: [], toolGroups: [], complexity: 'medium' as const, skills: [] }`
- Line 243: `return { stages: [], toolGroups: [], complexity: 'medium' as const, skills: [] }`
- Catch block (line 268): `return { stages: [], toolGroups: [], complexity: 'medium' as const, skills: [] }`

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit 2>&1 | grep -i "planner\|taor" | head -10
```

Expected: errors in taor-loop.ts (it doesn't use `skills` yet) but no errors in planner.ts.

- [ ] **Step 8: Commit**

```bash
cd /tmp/bitbit-push
git add personal-assistant/src/lib/agent/planner.ts
git commit -m "feat: add skills field to Haiku planner output"
```

---

### Task 4: Context Assembly — Token Budget & Skill Tier

**Files:**
- Modify: `src/lib/conversation/types.ts`
- Modify: `src/lib/context-assembly/token-budget-manager.ts`
- Modify: `src/lib/context-assembly/context-assembler.ts`

- [ ] **Step 1: Add skillPrompts to TokenAllocation**

In `src/lib/conversation/types.ts`, find the `TokenAllocation` interface (line 186) and add `skillPrompts`:

```typescript
export interface TokenAllocation {
  systemPrompt: number
  entityContext: number
  recentTurns: number
  compressedHistory: number
  keyFacts: number
  pendingActions: number
  retrievedContext: number
  skillPrompts: number
  total: number
  budget: number
  overBudget: boolean
}
```

- [ ] **Step 2: Update TokenBudgetManager to handle skillPrompts**

In `src/lib/context-assembly/token-budget-manager.ts`, find the `allocate` method's result construction (line 123). Add `skillPrompts`:

```typescript
    const result: TokenAllocation = {
      systemPrompt: allocations.get('systemPrompt') ?? 0,
      entityContext: allocations.get('entityContext') ?? 0,
      recentTurns: allocations.get('recentTurns') ?? 0,
      compressedHistory: allocations.get('compressedHistory') ?? 0,
      keyFacts: allocations.get('keyFacts') ?? 0,
      pendingActions: allocations.get('pendingActions') ?? 0,
      retrievedContext: allocations.get('retrievedContext') ?? 0,
      skillPrompts: allocations.get('skillPrompts') ?? 0,
      total: 0,
      budget: this.budget,
      overBudget: false,
    }

    result.total =
      result.systemPrompt +
      result.entityContext +
      result.recentTurns +
      result.compressedHistory +
      result.keyFacts +
      result.pendingActions +
      result.retrievedContext +
      result.skillPrompts
    result.overBudget = result.total > this.budget
```

- [ ] **Step 3: Add skillPrompts tier to context assembler**

In `src/lib/context-assembly/context-assembler.ts`, find the `tiers` array in the `assemble` method (line 541). Add a new tier for skill prompts after `retrievedContext` (priority 4.5 — between retrieved context and entity context):

```typescript
      {
        name: 'skillPrompts',
        content: '', // Populated later by TAOR loop after skill resolution
        priority: 4,
        minTokens: 0,
        maxTokens: 8000,
        compressible: true,
      },
```

Note: adjust the priority numbers so `skillPrompts` is priority 4 and `retrievedContext` moves to priority 5. The existing tiers after it shift down:
- retrievedContext: 5 (was 4)
- entityContext: 6 (was 5)
- compressedHistory: 7 (was 6)
- keyFacts: 8 (was 7)

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit 2>&1 | head -15
```

Expected: no errors related to token allocation or context assembler.

- [ ] **Step 5: Commit**

```bash
cd /tmp/bitbit-push
git add personal-assistant/src/lib/conversation/types.ts personal-assistant/src/lib/context-assembly/token-budget-manager.ts personal-assistant/src/lib/context-assembly/context-assembler.ts
git commit -m "feat: add skillPrompts tier to context assembly token budget"
```

---

### Task 5: Swarm Capability Boundaries

**Files:**
- Modify: `src/lib/swarm/types.ts`

- [ ] **Step 1: Add allowedSkills to CapabilityBoundary**

In `src/lib/swarm/types.ts`, find the `CapabilityBoundary` interface (line 78) and add `allowedSkills`:

```typescript
export interface CapabilityBoundary {
  allowedToolGroups: ToolGroup[]
  allowedSkills?: string[]          // skill IDs this role can activate
  deniedTools?: string[]            // specific tool names to block
  requiresApproval?: string[]       // tools that need approval even if auto-execute would normally apply
}
```

- [ ] **Step 2: Add allowedSkills to DEFAULT_CAPABILITIES**

Update `DEFAULT_CAPABILITIES` (line 84) to include empty skill belts (populated when actual skills are authored):

```typescript
export const DEFAULT_CAPABILITIES: Record<AgentRole, CapabilityBoundary> = {
  sales: {
    allowedToolGroups: ['core', 'memory', 'channel'],
    allowedSkills: [],
    deniedTools: ['generate_invoice', 'send_email'],
  },
  finance: {
    allowedToolGroups: ['core', 'memory'],
    allowedSkills: [],
    deniedTools: ['send_email', 'send_sms', 'send_whatsapp'],
    requiresApproval: ['generate_invoice'],
  },
  comms: {
    allowedToolGroups: ['core', 'memory', 'channel', 'comms'],
    allowedSkills: [],
    deniedTools: ['generate_invoice'],
    requiresApproval: ['send_email', 'send_sms', 'send_whatsapp'],
  },
  operations: {
    allowedToolGroups: ['core', 'memory', 'channel'],
    allowedSkills: [],
    deniedTools: ['send_email', 'generate_invoice'],
  },
  research: {
    allowedToolGroups: ['core', 'memory', 'web'],
    allowedSkills: [],
    deniedTools: ['send_email', 'send_sms', 'generate_invoice', 'create_task'],
  },
  coordinator: {
    allowedToolGroups: ['core', 'memory'],
    allowedSkills: [],
    deniedTools: [],
  },
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit 2>&1 | grep -i "swarm" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /tmp/bitbit-push
git add personal-assistant/src/lib/swarm/types.ts
git commit -m "feat: add allowedSkills to swarm capability boundaries"
```

---

### Task 6: Wire Skills into TAOR Loop

**Files:**
- Modify: `src/lib/agent/engine/taor-loop.ts`

This is the integration task — wiring Skill RAG → planner → resolve → context injection + tool registration.

- [ ] **Step 1: Add skill imports**

At the top of `src/lib/agent/engine/taor-loop.ts`, after the existing imports (around line 10), add:

```typescript
import { getAllSkills, resolveSkill, initializeSkillRegistry } from '@/lib/skills/registry'
import { selectRelevantSkills as selectRelevantSkillsRAG } from '@/lib/skills/skill-rag'
import type { ResolvedSkill } from '@/lib/skills/types'
```

- [ ] **Step 2: Initialize skill registry on first run**

Add a module-level initialization guard after the constants section (after line 80):

```typescript
let skillRegistryInitialized = false
async function ensureSkillRegistry(): Promise<void> {
  if (skillRegistryInitialized) return
  await initializeSkillRegistry()
  skillRegistryInitialized = true
}
```

- [ ] **Step 3: Run Skill RAG before planner**

In the `runTAORLoop` function, after the entity context extraction (line 202, after `const entityContext = ...`), add skill RAG:

```typescript
  // ── 4b. Skill RAG: select relevant skill candidates ──────────────────
  await ensureSkillRegistry()
  const skillIndex = config.toolGroups ? [] : getAllSkills() // Swarm agents: skills handled separately via allowedSkills
  const skillRAGResult = selectRelevantSkillsRAG(message, skillIndex)
  const skillCandidates = skillRAGResult.candidates.length > 0
    ? skillRAGResult.candidates.map(c => ({ id: c.id, description: c.description }))
    : undefined

  if (skillRAGResult.candidates.length > 0) {
    logger.info('[engine] Skill RAG candidates', {
      candidates: skillRAGResult.candidates.map(c => `${c.id}(${c.score})`),
    })
  }
```

- [ ] **Step 4: Pass skill candidates to planner**

Find the `generatePlan` call (line 213):

```typescript
    planPromise = generatePlan(message, entityContext, toolNames)
      .catch(() => ({ stages: [], toolGroups: [], complexity: 'medium' as const }) as PlanOutput)
```

Replace with:

```typescript
    planPromise = generatePlan(message, entityContext, toolNames, skillCandidates)
      .catch(() => ({ stages: [], toolGroups: [], complexity: 'medium' as const, skills: [] }) as PlanOutput)
```

- [ ] **Step 5: Resolve selected skills after planner returns**

After the planner race result handling (after `planComplexity = raceResult.plan.complexity` around line 225), add skill resolution:

```typescript
      // Resolve skills selected by planner
      const resolvedSkills: ResolvedSkill[] = []
      if (raceResult.plan.skills && raceResult.plan.skills.length > 0) {
        for (const skillId of raceResult.plan.skills.slice(0, 2)) {
          const resolved = await resolveSkill(skillId)
          if (resolved) resolvedSkills.push(resolved)
        }
        if (resolvedSkills.length > 0) {
          logger.info('[engine] Skills activated', {
            skills: resolvedSkills.map(s => s.entry.id),
            totalTokens: resolvedSkills.reduce((sum, s) => sum + s.entry.estimatedTokens, 0),
          })
        }
      }
```

- [ ] **Step 6: Register skill tools into the active tool set**

After the resolvedSkills block, add tool registration:

```typescript
      // Register skill tools into active tool set
      for (const skill of resolvedSkills) {
        if (skill.tools && skill.tools.length > 0) {
          const skillTools: Anthropic.Tool[] = skill.tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema as Anthropic.Tool.InputSchema,
          }))
          tools = [...tools, ...skillTools.filter(st => !tools.some(t => t.name === st.name))]
          toolNames = tools.map(t => t.name)
        }
      }
```

- [ ] **Step 7: Inject skill prompts into system prompt**

After the plan description section in the system prompt building (around line 291, after the `planDescription` block), add skill prompt injection:

```typescript
  // Inject activated skill prompts
  if (resolvedSkills.length > 0) {
    let skillSection = '\n\n### Active Skills\nThe following domain skills are active for this turn:\n'
    for (const skill of resolvedSkills) {
      skillSection += `\n#### ${skill.entry.name}\n${skill.prompt}\n`
    }
    fullSystemPrompt += skillSection
  }
```

**IMPORTANT scoping note:** `resolvedSkills` must be declared at the same level as `planComplexity` (before the `if (planPromise)` block) so it's accessible when building the system prompt. The declaration line from Step 5/6 goes here:

```typescript
  let planComplexity: 'low' | 'medium' | 'high' | null = null
  let resolvedSkills: ResolvedSkill[] = []
```

The skill resolution (Step 5) and tool registration (Step 6) code goes inside the `if (raceResult.ready && raceResult.plan.stages.length > 0)` block, after `planComplexity = raceResult.plan.complexity`.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new type errors from our changes.

- [ ] **Step 9: Commit**

```bash
cd /tmp/bitbit-push
git add personal-assistant/src/lib/agent/engine/taor-loop.ts
git commit -m "feat: wire Skill RAG + planner + resolve into TAOR loop"
```

---

### Task 7: Verify End-to-End and Build

**Files:** None (verification only)

- [ ] **Step 1: Verify the full flow connects**

Read through the code path to confirm:
1. `registry.ts` → `initializeSkillRegistry()` scans `src/skills/*/skill.json`
2. `skill-rag.ts` → `selectRelevantSkills()` scores index against message, returns candidates
3. `planner.ts` → `generatePlan()` receives skill candidates, returns `{ ..., skills: ['seo-audit'] }`
4. `taor-loop.ts` → captures `raceResult.plan.skills`, resolves via `resolveSkill()`
5. `taor-loop.ts` → resolved skill tools registered into active tool set
6. `taor-loop.ts` → resolved skill prompts injected into `fullSystemPrompt`
7. `types.ts` → `CapabilityBoundary` has `allowedSkills` for swarm role-scoping
8. `token-budget-manager.ts` → `skillPrompts` tier allocated in budget

- [ ] **Step 2: Verify TypeScript compiles clean**

```bash
cd /tmp/bitbit-push/personal-assistant && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new type errors from our changes.

- [ ] **Step 3: Run production build**

```bash
cd /tmp/bitbit-push/personal-assistant && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 4: Push to remote**

```bash
cd /tmp/bitbit-push
git push origin fix-clobbered-files:main
```
