import type { Metadata } from "next";
import { Inter, Geist_Mono, JetBrains_Mono, EB_Garamond } from "next/font/google";
import "./globals.css";
import "@/styles/animations.css";
import "@/styles/splash.css";
import {
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME_NAME,
  resolveThemeColor,
} from "@/lib/theme/defaults";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-bb-mono",
  subsets: ["latin"],
  display: "swap",
});

const ebGaramond = EB_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BitBit - AI Operations Platform",
    template: "%s | BitBit",
  },
  description: "Agentic AI operations platform for digital agencies. Automate leads, invoices, comms, and tenders with intelligent agents.",
  keywords: ["AI operations", "digital agency", "automation", "agents", "leads", "invoices"],
  authors: [{ name: "BitBit" }],
  icons: {
    icon: "/bitbit-logo.svg",
    shortcut: "/bitbit-logo.svg",
    apple: "/bitbit-logo-192.png",
  },
  openGraph: {
    type: "website",
    siteName: "BitBit",
    title: "BitBit - AI Operations Platform",
    description: "Agentic AI operations platform for digital agencies. Automate leads, invoices, comms, and tenders.",
    locale: "en_AU",
  },
  twitter: {
    card: "summary",
    title: "BitBit - AI Operations Platform",
    description: "Agentic AI operations platform for digital agencies.",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const defaultThemeColor = resolveThemeColor(DEFAULT_COLOR_MODE, DEFAULT_THEME_NAME);

  return (
    <html lang="en" className={DEFAULT_COLOR_MODE} data-theme={DEFAULT_THEME_NAME} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var isLanding = window.location.pathname === '/';
            if (isLanding) {
              document.documentElement.classList.remove('dark');
              document.addEventListener('DOMContentLoaded', function() {
                document.body.classList.remove('bitbit-dark');
              });
            } else {
              var colorMode = localStorage.getItem('bitbit-theme') || '${DEFAULT_COLOR_MODE}';
              var palette = localStorage.getItem('bb-theme') || '${DEFAULT_THEME_NAME}';
              var cls = colorMode === 'light' ? 'light' : 'dark';
              document.documentElement.className = cls;
              document.documentElement.setAttribute('data-theme', palette);
              document.documentElement.style.colorScheme = cls;
              var meta = document.querySelector('meta[name="theme-color"]');
              if (meta) {
                var nextColor = cls === 'dark' ? '#0a0f1a' : palette === 'aurora' ? '#f5efe7' : '#fafaf9';
                meta.setAttribute('content', nextColor);
              }
            }
          } catch(e) {}
        `}} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={defaultThemeColor} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/bitbit-logo-192.png" />
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} ${jetbrainsMono.variable} ${ebGaramond.variable} antialiased bitbit-dark`}
      >
        {children}
      </body>
    </html>
  );
}
