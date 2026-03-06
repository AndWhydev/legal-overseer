import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { EB_Garamond } from "next/font/google";
import "./globals.css";
import DemoNav from "./components/DemoNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ebGaramond = EB_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "BitBit — Your AI Business Operations Assistant",
  description: "An AI that knows your world. BitBit integrates deeply with your life and business, modular, adaptive, and human-centered.",
  icons: {
    icon: "/bitbit-logo.svg",
    shortcut: "/bitbit-logo.svg",
    apple: "/bitbit-logo-192.png",
  },
  openGraph: {
    title: "BitBit — Your AI Business Operations Assistant",
    description: "An AI that knows your world. BitBit integrates deeply with your life and business.",
    type: "website",
    locale: "en_US",
    url: "https://bitbit.chat",
    siteName: "BitBit",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "BitBit — Your AI Business Operations Assistant",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BitBit — Your AI Business Operations Assistant",
    description: "An AI that knows your world.",
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
        className={`${geistSans.variable} ${geistMono.variable} ${ebGaramond.variable} antialiased`}
      >
        <DemoNav />
        {children}
      </body>
    </html>
  );
}
