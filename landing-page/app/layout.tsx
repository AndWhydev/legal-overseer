import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meet BitBit 👋",
  description: "BitBit integrates with the tools you already use and acts on your behalf. Join the waitlist.",
  verification: {
    google: "aJ7xOpmke3WS7wZjRIn6qQmzmvWeFzsvqVhF6SldGII",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/bitbit-app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "BitBit — AI That Connects to Everything",
    description: "BitBit integrates with the tools you already use and acts on your behalf. Join the waitlist.",
    type: "website",
    locale: "en_US",
    url: "https://bitbit.chat",
    siteName: "BitBit",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "BitBit — AI That Connects to Everything",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BitBit — AI That Connects to Everything",
    description: "Join the waitlist.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ backgroundColor: "#09090b" }}
      >
        {children}
      </body>
    </html>
  );
}
