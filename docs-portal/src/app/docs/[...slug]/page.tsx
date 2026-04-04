import { notFound } from 'next/navigation'
import { compileMDX } from 'next-mdx-remote/rsc'
import { getDocBySlug, getAllDocSlugs, extractHeadings } from '@/lib/mdx'
import { Header } from '@/components/layout/header'
import { Sidebar } from '@/components/layout/sidebar'
import { TableOfContents } from '@/components/layout/toc'
import { navigation } from '@/docs.config'

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const doc = await getDocBySlug(slug)
  
  if (!doc) notFound()
  
  const { content: mdxContent } = await compileMDX({
    source: doc.source,
    options: { parseFrontmatter: true },
  })
  
  const headings = extractHeadings(doc.content)
  
  return (
    <>
      <Header />
      <div style={{ display: 'flex', minHeight: 'calc(100vh - var(--header-height))' }}>
        <Sidebar navigation={navigation} />
        <main style={{
          flex: 1,
          maxWidth: 'var(--content-max-width)',
          margin: '0 auto',
          padding: '2rem 1.5rem',
          minWidth: 0,
        }}>
          <h1>{doc.frontmatter.title as string}</h1>
          {doc.frontmatter.description && (
            <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              {doc.frontmatter.description as string}
            </p>
          )}
          <div className="mdx-content">
            {mdxContent}
          </div>
        </main>
        <TableOfContents headings={headings} />
      </div>
    </>
  )
}

export function generateStaticParams() {
  return getAllDocSlugs().map(slug => ({ slug }))
}
