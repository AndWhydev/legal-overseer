import type { Metadata } from "next"
import "./globals.css"
import { Inter, Lora, JetBrains_Mono } from "next/font/google"
import { cn } from "@/lib/utils"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["400", "500", "600", "700"],
  display: "swap",
})

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
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={cn(inter.variable, lora.variable, jetbrainsMono.variable)}
    >
      <body>{children}</body>
    </html>
  )
}
