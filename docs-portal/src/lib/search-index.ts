import fs from "fs"
import path from "path"
import matter from "gray-matter"

export interface SearchEntry {
  title: string
  description: string
  href: string
  content: string // first 200 chars of body for preview
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
        entries.push({
          title: (data.title as string) || slug,
          description: (data.description as string) || "",
          href: `/docs/${slug}`,
          content: content.replace(/[#*`\[\]()]/g, "").slice(0, 200),
        })
      }
    }
  }

  walk(contentDir)
  return entries
}
