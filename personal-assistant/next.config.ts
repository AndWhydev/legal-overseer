import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: false,
      },
    ];
  },
  serverExternalPackages: [
    '@whiskeysockets/baileys',
    'jimp',
    'sharp',
    'link-preview-js',
  ],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.gravatar.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  turbopack: {},
  webpack: (config) => {
    // Agent packages have been removed — no webpack aliases needed
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || 'bitbit-d1',
  project: process.env.SENTRY_PROJECT || 'bitbit-dashboard',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
