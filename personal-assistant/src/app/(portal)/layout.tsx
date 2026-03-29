import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import '../globals.css'

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Client Portal',
  description: 'Your project hub',
  robots: { index: false, follow: false },
}

export default function PortalRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#FAFAFA" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={`${dmSans.variable} antialiased`} style={{ background: '#FAFAFA' }}>
        {children}
      </body>
    </html>
  )
}
