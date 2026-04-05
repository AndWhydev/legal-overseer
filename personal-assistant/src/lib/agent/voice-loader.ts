import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

interface CacheEntry {
  timestamp: number
  content: string
}

const voiceCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function loadVoiceProfile(
  deploymentSlug: string,
  profileName?: string
): Promise<string> {
  // Build cache key
  const cacheKey = `${deploymentSlug}:${profileName || 'default'}`

  // Check cache first
  const cached = voiceCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.content
  }

  try {
    const projectRoot = process.cwd()
    const voicesDir = join(projectRoot, 'deployments', deploymentSlug, 'voices')

    if (!existsSync(voicesDir)) {
      return ''
    }

    let targetFile: string | null = null

    if (profileName) {
      // Look for specific profile file
      const fileName = `${profileName}.md`
      const filePath = join(voicesDir, fileName)
      if (existsSync(filePath)) {
        targetFile = fileName
      }
    } else {
      // Find first .md file
      const files = readdirSync(voicesDir)
        .filter(file => file.endsWith('.md'))
        .sort()
      if (files.length > 0) {
        targetFile = files[0]
      }
    }

    if (!targetFile) {
      return ''
    }

    const voiceText = readFileSync(join(voicesDir, targetFile), 'utf-8')

    // Cache the result
    voiceCache.set(cacheKey, {
      timestamp: Date.now(),
      content: voiceText,
    })

    return voiceText
  } catch {
    return ''
  }
}
