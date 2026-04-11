export function isCloudInferenceUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname === 'cloud.inference.sh'
  } catch {
    return false
  }
}

/**
 * Extract YouTube video ID from various URL formats
 */
export function getYouTubeVideoId(url: string): string | null {
  try {
    if (!url) return null
    const urlObj = new URL(url)

    // youtu.be format
    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.slice(1)
    }

    // youtube.com formats
    if (urlObj.hostname === 'youtube.com' || urlObj.hostname === 'www.youtube.com') {
      // Watch URLs: youtube.com/watch?v=VIDEO_ID
      if (urlObj.searchParams.has('v')) {
        return urlObj.searchParams.get('v')
      }
      // Embed URLs: youtube.com/embed/VIDEO_ID
      if (urlObj.pathname.startsWith('/embed/')) {
        return urlObj.pathname.split('/')[2]
      }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Strip HTML comments from markdown content
 */
export function stripHtmlComments(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * Heuristic: determine if a string is likely Markdown rather than plain text
 */
export function isLikelyMarkdown(input: string): boolean {
  if (!input) return false
  let score = 0
  
  // Headings (# ...)
  if (/(?:^|\n)\s{0,3}#{1,6} \S/.test(input)) score += 2
  // Bold text
  if (/\*\*[\s\S]*?\*\*/.test(input)) score += 1
  // Italic text
  if (/(?:^|[^*])\*[^*\s][\s\S]*?\*(?:[^*]|$)/.test(input)) score += 1
  // Lists (-, *, +, or ordered)
  if (/(?:^|\n)\s{0,3}(?:[-*+] |\d+\. )\S/.test(input)) score += 1
  // Links/images
  if (/!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)/.test(input)) score += 2
  // Code blocks or inline code
  if (/(?:^|\n)```[\s\S]*?```/.test(input) || /`[^`\n]+`/.test(input)) score += 2
  // Blockquote
  if (/(?:^|\n)\s{0,3}>\s?\S/.test(input)) score += 1
  // Tables (GFM)
  if (/(?:^|\n)\|[^\n]*\|\s*(?:\n)\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?/.test(input)) score += 2
  // Horizontal rule
  if (/(?:^|\n)\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*(?:\n|$)/.test(input)) score += 1
  
  return score > 0
}

