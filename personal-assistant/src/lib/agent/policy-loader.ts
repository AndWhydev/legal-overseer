import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

interface CacheEntry {
  timestamp: number
  content: string
}

const policyCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function loadPolicies(deploymentSlug: string): Promise<string> {
  // Check cache first
  const cached = policyCache.get(deploymentSlug)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.content
  }

  try {
    const projectRoot = process.cwd()
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
    policyCache.set(deploymentSlug, {
      timestamp: Date.now(),
      content: policyText,
    })

    return policyText
  } catch {
    return ''
  }
}
