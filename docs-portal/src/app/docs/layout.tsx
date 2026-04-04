import { buildSearchIndex } from "@/lib/search-index"
import { SearchDialog } from "@/components/search/search-dialog"

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const searchEntries = buildSearchIndex()
  return (
    <>
      {children}
      <SearchDialog entries={searchEntries} />
    </>
  )
}
