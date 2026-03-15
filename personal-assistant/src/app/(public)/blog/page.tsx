import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllPosts } from '@/lib/blog/posts'

export const metadata: Metadata = {
  title: 'Blog — BitBit',
  description: 'Insights on AI operations, agency efficiency, and the future of work.',
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function BlogIndexPage() {
  const posts = getAllPosts()

  return (
    <main style={{ minHeight: '100vh', background: '#0A0E1A', color: '#E2E8F0' }}>
      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '24px 0',
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <span
              style={{
                width: 28, height: 28,
                background: 'linear-gradient(135deg, #FF5A1F, #FF7A45)',
                borderRadius: 8,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 700, fontSize: 18, color: '#E2E8F0', letterSpacing: '-0.02em' }}>BitBit</span>
          </Link>
          <nav style={{ display: 'flex', gap: 24 }}>
            <Link href="/pricing" style={{ color: '#94A3B8', textDecoration: 'none', fontSize: 14 }}>Pricing</Link>
            <Link href="/blog" style={{ color: '#FF5A1F', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Blog</Link>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '64px 24px 48px' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#FF5A1F', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          Blog
        </p>
        <h1 style={{ fontSize: 40, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.03em', lineHeight: 1.15, margin: '0 0 16px' }}>
          Thoughts on AI&nbsp;ops
        </h1>
        <p style={{ fontSize: 17, color: '#94A3B8', lineHeight: 1.6, margin: 0 }}>
          Insights on AI operations, agency efficiency, and building for the future.
        </p>
      </div>

      {/* Post list */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 80px' }}>
        {posts.length === 0 ? (
          <p style={{ color: '#64748B', fontSize: 15 }}>No posts yet. Check back soon.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                style={{ textDecoration: 'none' }}
              >
                <article
                  className="bb-blog-card"
                  style={{
                    background: 'rgba(15, 20, 30, 0.35)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '28px 32px',
                    marginBottom: 12,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  {/* Tags */}
                  {post.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#FF5A1F',
                            background: 'rgba(255,90,31,0.1)',
                            border: '1px solid rgba(255,90,31,0.2)',
                            borderRadius: 20,
                            padding: '2px 10px',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.02em', margin: '0 0 10px', lineHeight: 1.3 }}>
                    {post.title}
                  </h2>

                  <p style={{ fontSize: 15, color: '#94A3B8', lineHeight: 1.6, margin: '0 0 18px' }}>
                    {post.excerpt}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: '#64748B' }}>
                    <span style={{ fontWeight: 500, color: '#94A3B8' }}>{post.author}</span>
                    {post.authorRole && (
                      <>
                        <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                        <span>{post.authorRole}</span>
                      </>
                    )}
                    <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                    <span>{formatDate(post.date)}</span>
                    <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                    <span>{post.readTime} min read</span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
