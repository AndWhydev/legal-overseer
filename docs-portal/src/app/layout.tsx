import type { Metadata } from "next"
import "./globals.css"
import { JetBrains_Mono } from "next/font/google"
import { cn } from "@/lib/utils"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "BitBit Documentation",
  description:
    "Internal documentation for BitBit — Agentic AI Operations Platform",
  icons: {
    icon: [{url: "/favicon.png", sizes: "32x32", type: "image/png"}, {url: "/favicon-64.png", sizes: "64x64", type: "image/png"}],
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={cn(jetbrainsMono.variable)}
    >
      <body>{children}</body>
    </html>
  )
}
