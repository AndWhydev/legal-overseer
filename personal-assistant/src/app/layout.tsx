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
import { NavBar } from "@/components/marketing/nav-bar";

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
  description: "Agentic AI operations platform for digital agencies. Automate leads, invoices, communications, and tenders with intelligent agents.",
  keywords: [
    "AI operations",
    "digital agency",
    "automation",
    "AI agents",
    "leads management",
    "invoice automation",
    "business automation",
    "operations platform",
  ],
  authors: [{ name: "BitBit" }],
  creator: "BitBit",
  publisher: "BitBit",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/bitbit-app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon-32.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "BitBit",
    title: "BitBit - AI Operations Platform",
    description: "Agentic AI operations platform for digital agencies. Automate leads, invoices, communications, and tenders.",
    locale: "en_AU",
    url: "https://bitbit.chat",
    images: [
      {
        url: "https://bitbit.chat/og-image.png",
        width: 1200,
        height: 630,
        alt: "BitBit - AI Operations Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BitBit - AI Operations Platform",
    description: "Agentic AI operations platform for digital agencies.",
    site: "@bitbitchat",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://bitbit.chat",
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://bitbit.chat/#organization",
                  "name": "BitBit",
                  "url": "https://bitbit.chat",
                  "logo": "https://bitbit.chat/logo.png",
                  "description": "Agentic AI operations platform for digital agencies",
                  "sameAs": [
                    "https://twitter.com/bitbitchat",
                    "https://github.com/bitbit",
                    "https://linkedin.com/company/bitbit",
                  ],
                  "contactPoint": {
                    "@type": "ContactPoint",
                    "contactType": "Customer Service",
                    "email": "support@bitbit.chat",
                  },
                },
                {
                  "@type": "SoftwareApplication",
                  "@id": "https://bitbit.chat/#software",
                  "name": "BitBit",
                  "applicationCategory": "BusinessApplication",
                  "operatingSystem": "Web",
                  "url": "https://bitbit.chat",
                  "description": "AI operations platform that automates leads, invoices, communications, and tenders with intelligent agents",
                  "offers": {
                    "@type": "AggregateOffer",
                    "priceCurrency": "USD",
                    "lowPrice": "29",
                    "highPrice": "299",
                    "offerCount": 3,
                  },
                  "aggregateRating": {
                    "@type": "AggregateRating",
                    "ratingValue": "4.8",
                    "ratingCount": "150",
                    "bestRating": "5",
                    "worstRating": "1",
                  },
                  "featureList": [
                    "Semantic Memory",
                    "Smart Triage",
                    "Approval Queue",
                    "Kanban + CRM",
                  ],
                },
              ],
            }),
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var isLanding = window.location.pathname === '/';
            if (isLanding) {
              document.documentElement.classList.remove('dark');
              document.addEventListener('DOMContentLoaded', function() {
                document.body.classList.remove('bitbit-dark');
              });
            } else {
              var palette = localStorage.getItem('bb-theme') || '${DEFAULT_THEME_NAME}';
              if (palette !== 'midnight' && palette !== 'aurora' && palette !== 'light') palette = '${DEFAULT_THEME_NAME}';
              var cls = palette === 'midnight' ? 'dark' : 'light';
              document.documentElement.className = cls;
              document.documentElement.setAttribute('data-theme', palette);
              document.documentElement.style.colorScheme = cls;
              var meta = document.querySelector('meta[name="theme-color"]');
              if (meta) {
                var nextColor = palette === 'midnight' ? '#0a0f1a' : palette === 'aurora' ? '#f5efe7' : '#fafaf9';
                meta.setAttribute('content', nextColor);
              }
            }
          } catch(e) {}
        `}} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={defaultThemeColor} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} ${jetbrainsMono.variable} ${ebGaramond.variable} antialiased bitbit-dark`}
      >
        <NavBar />
        {children}
      </body>
    </html>
  );
}
