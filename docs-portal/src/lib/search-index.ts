import fs from "fs"
import path from "path"
import matter from "gray-matter"

export interface SearchEntry {
  title: string
  section: string
  description: string
  href: string
  content: string
}

export function buildSearchIndex(): SearchEntry[] {
  const contentDir = path.join(process.cwd(), "content")
  const entries: SearchEntry[] = []

  function walk(dir: string, prefix: string[] = []) {
    if (!fs.existsSync(dir)) return
    const items = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of items) {
      if (item.isDirectory()) {
        walk(path.join(dir, item.name), [...prefix, item.name])
      } else if (item.name.endsWith(".mdx")) {
        const filePath = path.join(dir, item.name)
        const source = fs.readFileSync(filePath, "utf-8")
        const { data, content } = matter(source)
        const slug = [...prefix, item.name.replace(".mdx", "")].join("/")
        // Strip MDX components, imports, and markdown syntax for plain text
        const plainContent = content
          .replace(/^import\s.*$/gm, "")
          .replace(/<[^>]+>/g, "")
          .replace(/```[\s\S]*?```/g, "")
          .replace(/[#*`\[\](){}|>_~]/g, "")
          .replace(/\n{2,}/g, "\n")
          .trim()

        const sectionName = prefix.length > 0
          ? prefix[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : "Overview"

        entries.push({
          title: (data.title as string) || slug,
          section: sectionName,
          description: (data.description as string) || "",
          href: `/docs/${slug}`,
          content: plainContent.slice(0, 500),
        })
      }
    }
  }

  walk(contentDir)
  return entries
}
