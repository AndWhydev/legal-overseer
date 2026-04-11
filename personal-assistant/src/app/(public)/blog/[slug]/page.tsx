import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getAllPosts, getPostBySlug } from '@/lib/blog/posts'

interface Params {
  slug: string
}

export async function generateStaticParams(): Promise<Params[]> {
  return getAllPosts().map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: 'Not Found' }
  return {
    title: `${post.title} — BitBit Blog`,
    description: post.excerpt,
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

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
            <span style={{ fontWeight: 500, fontSize: 18, color: '#E2E8F0', letterSpacing: '-0.02em' }}>BitBit</span>
          </Link>
          <nav style={{ display: 'flex', gap: 24 }}>
            <Link href="/pricing" style={{ color: '#94A3B8', textDecoration: 'none', fontSize: 14 }}>Pricing</Link>
            <Link href="/blog" style={{ color: '#94A3B8', textDecoration: 'none', fontSize: 14 }}>Blog</Link>
          </nav>
        </div>
      </div>

      {/* Article */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '56px 24px 96px' }}>
        {/* Back link */}
        <Link
          href="/blog"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: '#64748B', textDecoration: 'none',
            marginBottom: 40,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M8.5 2.5L4 7l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All posts
        </Link>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
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

        {/* Title */}
        <h1 style={{
          fontSize: 40, fontWeight: 500, color: '#F1F5F9',
          letterSpacing: '-0.03em', lineHeight: 1.2,
          margin: '0 0 20px',
        }}>
          {post.title}
        </h1>

        {/* Byline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48, paddingBottom: 32, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #FF5A1F 0%, #8B5CF6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 500, color: '#fff', flexShrink: 0,
            }}
          >
            {post.author.charAt(0).toUpperCase()}
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0', margin: 0 }}>{post.author}</p>
            {post.authorRole && (
              <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>{post.authorRole}</p>
            )}
          </div>
          <span style={{ color: 'rgba(255,255,255,0.12)', margin: '0 4px' }}>·</span>
          <span style={{ fontSize: 13, color: '#64748B' }}>{formatDate(post.date)}</span>
          <span style={{ color: 'rgba(255,255,255,0.12)', margin: '0 4px' }}>·</span>
          <span style={{ fontSize: 13, color: '#64748B' }}>{post.readTime} min read</span>
        </div>

        {/* Content */}
        <div style={{ fontSize: 17, lineHeight: 1.75, color: '#CBD5E1' }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 style={{ fontSize: 32, fontWeight: 500, color: '#F1F5F9', letterSpacing: '-0.02em', margin: '48px 0 16px', lineHeight: 1.25 }}>{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 style={{ fontSize: 24, fontWeight: 500, color: '#F1F5F9', letterSpacing: '-0.02em', margin: '40px 0 14px', lineHeight: 1.3 }}>{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 style={{ fontSize: 19, fontWeight: 600, color: '#E2E8F0', margin: '32px 0 10px', lineHeight: 1.35 }}>{children}</h3>
              ),
              p: ({ children }) => (
                <p style={{ margin: '0 0 22px', color: '#CBD5E1' }}>{children}</p>
              ),
              ul: ({ children }) => (
                <ul style={{ margin: '0 0 22px', paddingLeft: 24, color: '#CBD5E1' }}>{children}</ul>
              ),
              ol: ({ children }) => (
                <ol style={{ margin: '0 0 22px', paddingLeft: 24, color: '#CBD5E1' }}>{children}</ol>
              ),
              li: ({ children }) => (
                <li style={{ margin: '6px 0', lineHeight: 1.65 }}>{children}</li>
              ),
              strong: ({ children }) => (
                <strong style={{ fontWeight: 500, color: '#E2E8F0' }}>{children}</strong>
              ),
              a: ({ href, children }) => (
                <a href={href} style={{ color: '#FF5A1F', textDecoration: 'underline', textDecorationColor: 'rgba(255,90,31,0.4)' }}>{children}</a>
              ),
              blockquote: ({ children }) => (
                <blockquote style={{
                  borderLeft: '3px solid #FF5A1F',
                  margin: '24px 0',
                  padding: '12px 20px',
                  background: 'rgba(255,90,31,0.05)',
                  borderRadius: '0 8px 8px 0',
                  color: '#94A3B8',
                  fontStyle: 'italic',
                }}>{children}</blockquote>
              ),
              code: ({ children, className }) => {
                const isBlock = className?.startsWith('language-')
                if (isBlock) {
                  return (
                    <code style={{
                      display: 'block',
                      background: 'var(--glass-bg-heavy, rgba(13, 17, 23, 0.8))',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      padding: '16px 20px',
                      fontSize: 13,
                      fontFamily: 'JetBrains Mono, Fira Code, monospace',
                      color: '#94A3B8',
                      overflowX: 'auto',
                      lineHeight: 1.6,
                    }}>
                      {children}
                    </code>
                  )
                }
                return (
                  <code style={{
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: '0.875em',
                    fontFamily: 'JetBrains Mono, Fira Code, monospace',
                    color: '#FF7A45',
                  }}>
                    {children}
                  </code>
                )
              },
              pre: ({ children }) => (
                <pre style={{ margin: '0 0 22px', overflow: 'auto' }}>{children}</pre>
              ),
              hr: () => (
                <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '40px 0' }} />
              ),
            }}
          >
            {post.content}
          </ReactMarkdown>
        </div>

        {/* Footer CTA */}
        <div style={{
          marginTop: 64,
          padding: '32px',
          background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.5))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 16, color: '#94A3B8', margin: '0 0 16px' }}>
            Want to see BitBit in action?
          </p>
          <Link
            href="/pricing"
            style={{
              display: 'inline-block',
              background: '#FF5A1F',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              padding: '10px 24px',
              borderRadius: 8,
              textDecoration: 'none',
            }}
          >
            View pricing
          </Link>
        </div>
      </div>
    </main>
  )
}
