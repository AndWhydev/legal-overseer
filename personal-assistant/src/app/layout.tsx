import type { Metadata } from "next";
import { Geist_Mono, JetBrains_Mono, Libre_Baskerville } from "next/font/google";
import {
  GeistPixelSquare,
  GeistPixelGrid,
  GeistPixelCircle,
  GeistPixelTriangle,
  GeistPixelLine,
} from "geist/font/pixel";
import "./globals.css";
import "@/styles/animations.css";
import "@/styles/splash.css";
import {
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME_NAME,
  resolveThemeColor,
} from "@/lib/theme/defaults";
import { NavBar } from "@/components/marketing/nav-bar";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-bb-mono",
  subsets: ["latin"],
  display: "swap",
});

const libreBaskerville = Libre_Baskerville({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://bitbit.chat"),
  title: {
    default: "BitBit - AI Operations Platform",
    template: "%s | BitBit",
  },
  description:
    "Autonomous AI agents that handle invoicing, lead capture, client comms, and tenders. Built for agencies, trades, and professional services.",
  keywords: [
    "AI business assistant",
    "automated invoicing",
    "lead management AI",
    "AI operations platform",
    "agency automation",
    "trades business automation",
    "AI agents",
    "digital agency",
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
    title: "BitBit - AI Operations That Actually Work",
    description:
      "Autonomous AI agents that handle invoicing, lead capture, client comms, and tenders. Built for agencies, trades, and professional services.",
    url: "https://bitbit.chat",
    siteName: "BitBit",
    locale: "en_AU",
    type: "website",
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
    title: "BitBit - AI Operations That Actually Work",
    description:
      "Autonomous AI agents for agencies, trades, and professional services.",
    images: ["https://bitbit.chat/og-image.png"],
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
    canonical: "/",
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
                  "logo": "https://bitbit.chat/bitbit-app-icon-192.png",
                  "description": "AI operations platform for digital agencies, trades, and professional services",
                  "sameAs": [],
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
                  "description": "Autonomous AI agents that handle invoicing, lead capture, client communications, and business operations",
                  "offers": {
                    "@type": "AggregateOffer",
                    "priceCurrency": "AUD",
                    "lowPrice": "0",
                    "highPrice": "599",
                    "offerCount": "4",
                  },
                  "featureList": [
                    "Autonomous Agent Operations",
                    "Smart Email Triage",
                    "Invoice Automation",
                    "Lead Management",
                    "Content Creation",
                    "SEO Monitoring",
                  ],
                },
              ],
            }),
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var palette = localStorage.getItem('bb-theme') || '${DEFAULT_THEME_NAME}';
            if (palette !== 'midnight' && palette !== 'light') palette = '${DEFAULT_THEME_NAME}';
            var cls = palette === 'midnight' ? 'dark' : 'light';
            document.documentElement.className = cls;
            document.documentElement.setAttribute('data-theme', palette);
            document.documentElement.style.colorScheme = cls;
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) {
              var nextColor = palette === 'midnight' ? '#0a0f1a' : '#fafaf9';
              meta.setAttribute('content', nextColor);
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
        className={`${geistMono.variable} ${jetbrainsMono.variable} ${libreBaskerville.variable} ${GeistPixelSquare.variable} ${GeistPixelGrid.variable} ${GeistPixelCircle.variable} ${GeistPixelTriangle.variable} ${GeistPixelLine.variable} antialiased bg-background text-foreground`}
      >
        <NavBar />
        {children}
      </body>
    </html>
  );
}