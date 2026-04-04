import { notFound } from "next/navigation"
import { compileMDX } from "next-mdx-remote/rsc"
import { getDocBySlug, getAllDocSlugs, extractHeadings } from "@/lib/mdx"
import { Header } from "@/components/layout/header"
import { Sidebar } from "@/components/layout/sidebar"
import { TableOfContents } from "@/components/layout/toc"
import { PrevNext } from "@/components/layout/prev-next"
import { SectionLabel } from "@/components/layout/section-label"
import { navigation } from "@/docs.config"

// Retained custom components
import { Tip, Note, Warning, Danger, Accordion, Mermaid, CardGroup, Card } from "@/components/mdx"

// jalco/ui components
import { Stepper, StepperItem } from "@/components/stepper"
import { CodeBlock } from "@/components/code-block"
import { CodeBlockCommand } from "@/components/code-block-command"
import { FileTree } from "@/components/file-tree"
import { ApiRefTable } from "@/components/api-ref-table"
import { CronSchedule } from "@/components/cron-schedule"
import { EnvTable } from "@/components/env-table"
import { Kbd, KbdCombo } from "@/components/kbd"
import { StatusIndicator } from "@/components/status-indicator"

// Custom diagrams
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
      // Retained custom
      Tip,
      Note,
      Warning,
      Danger,
      Accordion,
      Mermaid,
      CardGroup,
      Card,
      // jalco/ui
      Steps: Stepper,
      Step: StepperItem,
      CodeBlock,
      CodeGroup: CodeBlockCommand,
      CodeBlockCommand,
      FileTree,
      ApiRefTable,
      CronSchedule,
      EnvTable,
      Kbd,
      KbdCombo,
      StatusIndicator,
      // Diagrams
      LayerStack,
      TAORLoop,
      ContextTiers,
      ConfidenceRouting,
    },
  })

  const headings = extractHeadings(doc.content)
  const currentPath = "/docs/" + slug.join("/")

  // Find section title for the current page
  let sectionTitle = ""
  for (const section of navigation) {
    for (const item of section.items) {
      if (item.href === currentPath) {
        sectionTitle = section.title
      }
    }
  }

  return (
    <>
      <Header />
      <div style={{ display: "flex", minHeight: "calc(100vh - 104px)" }}>
        <Sidebar navigation={navigation} />
        <main
          style={{
            flex: 1,
            maxWidth: "720px",
            marginLeft: "auto",
            marginRight: "auto",
            padding: "32px 24px",
            minWidth: 0,
          }}
        >
          {sectionTitle && <SectionLabel label={sectionTitle} />}
          {doc.frontmatter.description && (
            <p
              style={{
                fontSize: "16px",
                lineHeight: "26.4px",
                color: "rgb(80, 80, 80)",
                marginBottom: "32px",
              }}
            >
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
