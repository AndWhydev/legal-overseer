"use client"

import * as React from "react"

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

  return (
    <aside
      data-slot="detail-sidebar-content"
      data-side={side}
      data-state={open ? "open" : "closed"}
      aria-hidden={!open}
      className={cn(
        "relative hidden h-full min-h-0 shrink-0 overflow-hidden border-l border-sidebar-border/70 bg-sidebar text-sidebar-foreground transition-[width,border-color] duration-300 ease-out md:block",
        open ? cn("w-[min(34rem,42vw)] xl:w-[36rem]", className) : "w-0 border-l-transparent",
      )}
      {...props}
    >
      <div
        className={cn(
          "flex h-full max-w-full flex-col bg-sidebar text-sidebar-foreground shadow-none transition-transform duration-300 ease-out",
          desktopWidthClass,
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {children}
      </div>
    </aside>
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
