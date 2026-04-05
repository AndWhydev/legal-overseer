import fs from "fs"
import path from "path"
import matter from "gray-matter"

const contentDir = path.join(process.cwd(), "content")

/**
 * Escape curly braces inside fenced code blocks so MDX does not
 * interpret them as JSX expressions.
 */
function escapeCodeBlocks(source: string): string {
  return source.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang: string, code: string) => {
      const escaped = code
        .replace(/\{/g, "&#123;")
        .replace(/\}/g, "&#125;")
      return "```" + lang + "\n" + escaped + "```"
    }
  )
}

export async function getDocBySlug(slug: string[]) {
  const filePath = path.join(contentDir, ...slug) + ".mdx"

  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, "utf-8")
  const { data: frontmatter, content } = matter(raw)

  // Pre-process: escape braces in fenced code blocks before MDX compilation
  const escapedContent = escapeCodeBlocks(content)
  // Rebuild the full source with frontmatter for compileMDX
  const source = matter.stringify(escapedContent, frontmatter)

  return { frontmatter, content, source }
}

export function getAllDocSlugs(): string[][] {
  const slugs: string[][] = []

  function walk(dir: string, prefix: string[] = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), [...prefix, entry.name])
      } else if (entry.name.endsWith(".mdx")) {
        slugs.push([...prefix, entry.name.replace(".mdx", "")])
      }
    }
  }

  if (fs.existsSync(contentDir)) walk(contentDir)
  return slugs
}

export function extractHeadings(content: string) {
  const headings: { id: string; text: string; level: number }[] = []
  const regex = /^(#{2,3})\s+(.+)$/gm
  let match
  while ((match = regex.exec(content)) !== null) {
    const text = match[2].trim()
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
    headings.push({ id, text, level: match[1].length })
  }
  return headings
}
