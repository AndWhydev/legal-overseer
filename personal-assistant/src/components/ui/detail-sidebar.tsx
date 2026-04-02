"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type DetailSidebarContextValue = {
  isMobile: boolean
  open: boolean
}

const DetailSidebarContext = React.createContext<DetailSidebarContextValue | null>(null)

function useDetailSidebarContext() {
  const context = React.useContext(DetailSidebarContext)

  if (!context) {
    throw new Error("DetailSidebar components must be used within DetailSidebar")
  }

  return context
}

function DetailSidebar({
  open = false,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof Sheet>) {
  const isMobile = useIsMobile()
  const contextValue = React.useMemo(() => ({ isMobile, open }), [isMobile, open])

  if (isMobile) {
    return (
      <DetailSidebarContext.Provider value={contextValue}>
        <Sheet data-slot="detail-sidebar" open={open} onOpenChange={onOpenChange} {...props}>
          {children}
        </Sheet>
      </DetailSidebarContext.Provider>
    )
  }

  return (
    <DetailSidebarContext.Provider value={contextValue}>
      <div data-slot="detail-sidebar" className="contents">
        {children}
      </div>
    </DetailSidebarContext.Provider>
  )
}

function DetailSidebarContent({
  className,
  children,
  side = "right",
  showCloseButton = false,
  inset = true,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  inset?: boolean
}) {
  const { isMobile, open } = useDetailSidebarContext()

  const desktopWidthClass = inset
    ? "w-[min(34rem,42vw)] xl:w-[36rem]"
    : "w-[min(36rem,46vw)] xl:w-[38rem]"

  if (isMobile) {
    return (
      <SheetContent
        data-slot="detail-sidebar-content"
        side={side}
        showCloseButton={showCloseButton}
        className={cn(
          "flex h-[100svh] w-full flex-col gap-0 overflow-hidden rounded-none border-border/80 bg-popover/96 p-0 text-popover-foreground shadow-2xl supports-backdrop-filter:backdrop-blur-xl",
          className
        )}
        {...props}
      >
        {children}
      </SheetContent>
    )
  }

  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => { setMounted(true) }, [])

  const fixedPanel = (
    <div
      data-slot="detail-sidebar-fixed"
      aria-hidden={!open}
      className={cn(
        "fixed inset-y-0 right-0 z-10 hidden h-svh p-2 pl-0 text-sidebar-foreground transition-[width] duration-300 ease-out md:flex",
        open ? desktopWidthClass : "w-0",
      )}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0"
        )}
      >
        {children}
      </div>
    </div>
  )

  return (
    <>
      {/* Gap: takes up space in the flow so sibling content shifts over */}
      <div
        data-slot="detail-sidebar-content"
        data-side={side}
        data-state={open ? "open" : "closed"}
        className={cn(
          "hidden shrink-0 bg-transparent transition-[width] duration-300 ease-out md:block",
          open ? desktopWidthClass : "w-0",
        )}
      />
      {/* Fixed panel: portalled to body so it escapes contain/overflow contexts */}
      {mounted && createPortal(fixedPanel, document.body)}
    </>
  )
}

function DetailSidebarHeader({
  className,
  style,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <SheetHeader
      data-slot="detail-sidebar-header"
      className={cn("shrink-0 gap-0 border-b border-sidebar-border/70 px-5 py-4", className)}
      style={style}
      {...props}
    />
  )
}

function DetailSidebarBody({
  className,
  style,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="detail-sidebar-body"
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5", className)}
      style={style}
      {...props}
    />
  )
}

function DetailSidebarFooter({
  className,
  style,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="detail-sidebar-footer"
      className={cn("shrink-0 border-t border-sidebar-border/70 px-5 pt-4 pb-5", className)}
      style={{
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
        ...style,
      }}
      {...props}
    />
  )
}

function DetailSidebarTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetTitle>) {
  const { isMobile } = useDetailSidebarContext()

  if (isMobile) {
    return <SheetTitle data-slot="detail-sidebar-title" className={cn(className)} {...props} />
  }

  return (
    <h2
      data-slot="detail-sidebar-title"
      className={cn("font-heading text-base font-medium text-sidebar-foreground", className)}
      {...props}
    />
  )
}

function DetailSidebarDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetDescription>) {
  const { isMobile } = useDetailSidebarContext()

  if (isMobile) {
    return (
      <SheetDescription
        data-slot="detail-sidebar-description"
        className={cn(className)}
        {...props}
      />
    )
  }

  return (
    <p
      data-slot="detail-sidebar-description"
      className={cn("text-sm text-sidebar-foreground/70", className)}
      {...props}
    />
  )
}

export {
  DetailSidebar,
  DetailSidebarBody,
  DetailSidebarContent,
  DetailSidebarDescription,
  DetailSidebarFooter,
  DetailSidebarHeader,
  DetailSidebarTitle,
}