import { notFound } from "next/navigation"
import { compileMDX } from "next-mdx-remote/rsc"
import { getDocBySlug, getAllDocSlugs, extractHeadings } from "@/lib/mdx"
import { Header } from "@/components/layout/header"
import { Sidebar } from "@/components/layout/sidebar"
import { TableOfContents } from "@/components/layout/toc"
import { Breadcrumbs } from "@/components/layout/breadcrumbs"
import { PrevNext } from "@/components/layout/prev-next"
import { navigation } from "@/docs.config"
import {
  Tip,
  Note,
  Warning,
  Danger,
  Steps,
  Step,
  CardGroup,
  Card,
  CodeGroup,
  CodeBlock,
  Param,
  Accordion,
  Mermaid,
} from "@/components/mdx"
import {
  LayerStack,
  TAORLoop,
  ContextTiers,
  ConfidenceRouting,
} from "@/components/diagrams"

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const doc = await getDocBySlug(slug)

  if (!doc) notFound()

  const { content: mdxContent } = await compileMDX({
    source: doc.source,
    options: { parseFrontmatter: true },
    components: {
      Tip,
      Note,
      Warning,
      Danger,
      Steps,
      Step,
      CardGroup,
      Card,
      CodeGroup,
      CodeBlock,
      Param,
      Accordion,
      Mermaid,
      LayerStack,
      TAORLoop,
      ContextTiers,
      ConfidenceRouting,
    },
  })

  const headings = extractHeadings(doc.content)

  return (
    <>
      <Header />
      <div className="flex min-h-[calc(100vh-var(--header-height))]">
        <Sidebar navigation={navigation} />
        <main className="flex-1 mx-auto px-6 py-8 min-w-0" style={{ maxWidth: "720px" }}>
          <Breadcrumbs />
          {doc.frontmatter.description && (
            <p className="text-lg mb-8" style={{ color: "rgba(38,38,38,0.80)" }}>
              {doc.frontmatter.description as string}
            </p>
          )}
          <div className="mdx-content">{mdxContent}</div>
          <PrevNext />
        </main>
        <TableOfContents headings={headings} />
      </div>
    </>
  )
}

export function generateStaticParams() {
  return getAllDocSlugs().map((slug) => ({ slug }))
}
