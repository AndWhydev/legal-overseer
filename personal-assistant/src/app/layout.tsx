import type { Metadata } from "next";
import { Inter, Geist_Mono, JetBrains_Mono, EB_Garamond } from "next/font/google";
import "./globals.css";
import "@/styles/animations.css";
import "@/styles/splash.css";

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
  title: "BitBit",
  description: "AI-powered operations assistant",
  icons: {
    icon: "/bitbit-logo.svg",
    shortcut: "/bitbit-logo.svg",
    apple: "/bitbit-logo-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
              var t = localStorage.getItem('bitbit-theme') || 'dark';
              document.documentElement.className = t;
            }
          } catch(e) {}
        `}} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0a0f1a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
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
