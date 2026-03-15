import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

export interface BlogPost {
  slug: string
  title: string
  date: string
  author: string
  authorRole?: string
  excerpt: string
  tags: string[]
  readTime: number
  content: string
}

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

function estimateReadTime(content: string): number {
  const wordsPerMinute = 200
  const wordCount = content.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute))
}

export function getAllPosts(): Omit<BlogPost, 'content'>[] {
  if (!fs.existsSync(BLOG_DIR)) return []

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    .sort()
    .reverse()

  return files.map((filename) => {
    const slug = filename.replace(/\.(mdx?|md)$/, '')
    const raw = fs.readFileSync(path.join(BLOG_DIR, filename), 'utf8')
    const { data, content } = matter(raw)

    return {
      slug,
      title: data.title ?? slug,
      date: data.date ?? '',
      author: data.author ?? 'BitBit Team',
      authorRole: data.authorRole ?? undefined,
      excerpt: data.excerpt ?? content.slice(0, 160).replace(/\n/g, ' ').trim() + '…',
      tags: Array.isArray(data.tags) ? data.tags : [],
      readTime: estimateReadTime(content),
    }
  })
}

export function getPostBySlug(slug: string): BlogPost | null {
  const extensions = ['.mdx', '.md']

  for (const ext of extensions) {
    const filePath = path.join(BLOG_DIR, `${slug}${ext}`)
    if (!fs.existsSync(filePath)) continue

    const raw = fs.readFileSync(filePath, 'utf8')
    const { data, content } = matter(raw)

    return {
      slug,
      title: data.title ?? slug,
      date: data.date ?? '',
      author: data.author ?? 'BitBit Team',
      authorRole: data.authorRole ?? undefined,
      excerpt: data.excerpt ?? content.slice(0, 160).replace(/\n/g, ' ').trim() + '…',
      tags: Array.isArray(data.tags) ? data.tags : [],
      readTime: estimateReadTime(content),
      content,
    }
  }

  return null
}
