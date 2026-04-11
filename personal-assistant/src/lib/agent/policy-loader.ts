import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'

interface CacheEntry {
  timestamp: number
  content: string
}

const policyCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function loadPolicies(
  deploymentSlug: string,
  supabase?: SupabaseClient,
  orgId?: string,
): Promise<string> {
  // Check cache first
  const cacheKey = orgId ? `${deploymentSlug}:${orgId}` : deploymentSlug
  const cached = policyCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.content
  }

  // Try Supabase first (org_policies table)
  if (supabase && orgId) {
    try {
      const { data } = await supabase
        .from('org_policies')
        .select('name, content')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('name')

      if (data && data.length > 0) {
        const policyText = data.map((p: { name: string; content: string }) => p.content).join('\n\n')
        policyCache.set(cacheKey, { timestamp: Date.now(), content: policyText })
        return policyText
      }
    } catch {
      // Fall through to disk
    }
  }

  // Fall back to disk
  try {
    const projectRoot = '/home/claude/bitbit'
    const policiesDir = join(projectRoot, 'deployments', deploymentSlug, 'policies')

    if (!existsSync(policiesDir)) {
      return ''
    }

    const files = readdirSync(policiesDir)
      .filter(file => file.endsWith('.md'))
      .sort()

    const contents: string[] = []
    for (const file of files) {
      try {
        const filePath = join(policiesDir, file)
        const content = readFileSync(filePath, 'utf-8')
        contents.push(content)
      } catch {
        // Skip files that can't be read
      }
    }

    const policyText = contents.join('\n\n')

    // Cache the result
    policyCache.set(cacheKey, {
      timestamp: Date.now(),
      content: policyText,
    })

    return policyText
  } catch {
    return ''
  }
}
