"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { filterNavByVisibility } from "@/lib/docs-visibility"
import { LogIn, LogOut, ChevronsUpDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface NavItem {
  title: string
  href?: string
  items?: NavItem[]
}

interface SidebarProps {
  navigation: { title: string; items: NavItem[] }[]
}

function SearchButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        padding: "5px 12px",
        border: "1px solid #e5e7eb",
        borderRadius: "6px",
        background: "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        marginBottom: "8px",
        height: "34px",
        boxSizing: "border-box",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)" }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "none" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}>
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
      <span style={{ flex: 1, textAlign: "left", fontSize: "13px", color: "#b4b4b4" }}>Search...</span>
      <kbd style={{ fontSize: "11px", fontFamily: "inherit", padding: "2px 5px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "4px", color: "#b4b4b4", lineHeight: "14px" }}>{"\u2318"}K</kbd>
    </button>
  )
}

function FlatSection({
  section,
  pathname,
}: {
  section: { title: string; items: NavItem[] }
  pathname: string
}) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#9ca3af",
          padding: "0 12px",
          marginBottom: "4px",
        }}
      >
        {section.title}
      </div>
      {section.items.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href || item.title}
            href={item.href || "#"}
            style={{
              display: "block",
              padding: "7px 12px",
              marginBottom: "1px",
              fontSize: "14px",
              lineHeight: "20px",
              textDecoration: "none",
              fontWeight: isActive ? 500 : 400,
              color: isActive ? "#171717" : "#6b7280",
              background: isActive ? "#f3f4f6" : "transparent",
              borderRadius: "6px",
              transition: "color 150ms ease, background-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "#374151"
                e.currentTarget.style.backgroundColor = "#f9fafb"
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = "#6b7280"
                e.currentTarget.style.backgroundColor = "transparent"
              }
            }}
          >
            {item.title}
          </Link>
        )
      })}
    </div>
  )
}

function AccountSelector() {
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (!user) return (
    <div style={{ borderTop: "1px solid #e5e7eb", padding: "12px 16px" }}>
      <a href="/login" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 12px", borderRadius: "6px", textDecoration: "none", color: "#6b7280", fontSize: "14px", fontWeight: 500 }}>
        <LogIn size={16} />
        <span>Sign in</span>
      </a>
    </div>
  )

  const email = user.email || ""
  const displayName = email.split("@")[0].charAt(0).toUpperCase() + email.split("@")[0].slice(1)
  const initials = displayName.slice(0, 2).toUpperCase()
  const role = email === "hi@torkay.com" ? "Admin" : "Viewer"

  return (
    <div style={{ borderTop: "1px solid #e5e7eb", padding: "12px 16px" }}>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            width: "100%",
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: "8px",
            background: "#f3f4f6",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "13px", fontWeight: 600, color: "#6b7280",
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 500, color: "#171717", lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
            <div style={{ fontSize: "12px", color: "#9ca3af", lineHeight: "16px" }}>{role}</div>
          </div>
          <ChevronsUpDown size={16} style={{ color: "#9ca3af", flexShrink: 0 }} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8}>
          <DropdownMenuGroup><DropdownMenuLabel>{displayName}<br /><span style={{ fontWeight: 400, color: "#9ca3af" }}>{email}</span></DropdownMenuLabel></DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut size={14} />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function Sidebar({ navigation }: SidebarProps) {
  const pathname = usePathname()
  const [isAuthed, setIsAuthed] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setIsAuthed(!!data.user))
  }, [])

  const filteredNav = filterNavByVisibility(navigation as any, isAuthed)

  return (
    <aside
      className="hidden md:flex"
      style={{
        width: "260px",
        height: "calc(100vh - 56px)",
        position: "sticky",
        top: "56px",
        flexShrink: 0,
        flexDirection: "column",
        background: "#fff",
        borderRight: "1px solid #e5e7eb",
      }}
    >
      {/* Search bar */}
      <div style={{ padding: "20px 12px 0 20px" }}>
        <SearchButton />
      </div>

      {/* Scrollable nav */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 20px 20px" }}>
        <nav>
          {filteredNav.map((section) => (
            <FlatSection
              key={section.title}
              section={section}
              pathname={pathname}
            />
          ))}
        </nav>
      </div>

      {/* Account selector */}
      <AccountSelector />
    </aside>
  )
}

// Exported for mobile nav drawer reuse
export function SidebarContent({ navigation }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Search bar */}
      <div style={{ padding: "16px 12px 0 12px" }}>
        <SearchButton />
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 16px 12px" }}>
        <nav>
          {navigation.map((section) => (
            <FlatSection
              key={section.title}
              section={section}
              pathname={pathname}
            />
          ))}
        </nav>
      </div>

      {/* Account selector */}
      <AccountSelector />
    </>
  )
}
