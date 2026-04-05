/**
 * Skill Registry — filesystem discovery and deferred resolution.
 *
 * Boot: scans src/skills/{name}/skill.json, builds in-memory index.
 * Per-turn: Skill RAG scores index, planner confirms, resolve() loads content.
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, resolve as resolvePath } from 'path'
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
 * Discover all skills from src/skills/{name}/skill.json at boot.
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

  // Use readdirSync to find subdirectories containing skill.json
  let subdirs: string[]
  try {
    subdirs = readdirSync(baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  } catch (err) {
    logger.error('[skill-registry] Failed to read skills directory', {
      baseDir,
      error: err instanceof Error ? err.message : String(err),
    })
    skillIndex = []
    initialized = true
    return
  }

  const entries: SkillIndexEntry[] = []

  for (const dirName of subdirs) {
    const dirPath = join(baseDir, dirName)
    const filePath = join(dirPath, 'skill.json')

    if (!existsSync(filePath)) continue

    try {
      const raw = readFileSync(filePath, 'utf-8')
      const json = JSON.parse(raw) as Record<string, unknown>

      const id = dirName

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
        roleAffinity: Array.isArray(json.roleAffinity) ? (json.roleAffinity as AgentRole[]) : [],
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
