import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '../../../globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Client Portal',
  description: 'Your project dashboard',
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="light">
      <head>
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body className={`${inter.variable} antialiased`} style={{
        fontFamily: 'var(--font-inter), system-ui, -apple-system, sans-serif',
        backgroundColor: '#fafbfc',
        color: '#1a1a2e',
        margin: 0,
        minHeight: '100vh',
      }}>
        {children}
      </body>
    </html>
  )
}
