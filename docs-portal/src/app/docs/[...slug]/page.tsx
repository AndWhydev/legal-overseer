import { notFound } from "next/navigation"
import { compileMDX } from "next-mdx-remote/rsc"
import { getDocBySlug, getAllDocSlugs, extractHeadings } from "@/lib/mdx"
import { Header } from "@/components/layout/header"
import { Sidebar } from "@/components/layout/sidebar"
import { TableOfContents } from "@/components/layout/toc"
import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { PrevNext } from "@/components/layout/prev-next"
import { navigation } from "@/docs.config"
import { Tip, Note, Warning, Steps, Step, CardGroup, Card, CodeGroup, CodeBlock, Param, Accordion } from "@/components/mdx"

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const doc = await getDocBySlug(slug)

  if (!doc) notFound()

  const { content: mdxContent } = await compileMDX({
    source: doc.source,
    options: { parseFrontmatter: true },
    components: { Tip, Note, Warning, Steps, Step, CardGroup, Card, CodeGroup, CodeBlock, Param, Accordion },
  })

  const headings = extractHeadings(doc.content)

  return (
    <>
      <Header />
      <div style={{ display: "flex", minHeight: "calc(100vh - var(--header-height))" }}>
        <Sidebar navigation={navigation} />
        <main style={{
          flex: 1,
          maxWidth: "var(--content-max-width)",
          margin: "0 auto",
          padding: "2rem 1.5rem",
          minWidth: 0,
        }}>
          <Breadcrumbs />
          <h1>{doc.frontmatter.title as string}</h1>
          {doc.frontmatter.description && (
            <p style={{ fontSize: "1.125rem", color: "var(--text-secondary)", marginBottom: "2rem" }}>
              {doc.frontmatter.description as string}
            </p>
          )}
          <div className="mdx-content">
            {mdxContent}
          </div>
          <PrevNext />
        </main>
        <TableOfContents headings={headings} />
      </div>
    </>
  )
}

export function generateStaticParams() {
  return getAllDocSlugs().map(slug => ({ slug }))
}
