import { buildSearchIndex } from "@/lib/search-index"
import { SearchDialog } from "@/components/search/search-dialog"
import { Header } from "@/components/layout/header"
import { Sidebar } from "@/components/layout/sidebar"
import { navigation } from "@/docs.config"

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const searchEntries = buildSearchIndex()
  return (
    <>
      <Header />
      <div className="docs-layout" style={{ display: "flex", minHeight: "calc(100vh - 56px)" }}>
        <Sidebar navigation={navigation} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {children}
        </div>
      </div>
      <SearchDialog entries={searchEntries} />
    </>
  )
}
