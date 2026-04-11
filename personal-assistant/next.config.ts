import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(configDir, '..'),
  serverExternalPackages: [
    '@whiskeysockets/baileys',
    'jimp',
    'sharp',
    'link-preview-js',
    'voyageai',
    'ssh2',
  ],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.gravatar.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },

};

const isDev = process.env.NODE_ENV !== 'production';
const withSentry = isDev
  ? (c: NextConfig) => c
  : (c: NextConfig) =>
      withSentryConfig(c, {
        org: process.env.SENTRY_ORG?.trim() || 'bitbit-d1',
        project: process.env.SENTRY_PROJECT?.trim() || 'bitbit-dashboard',
        silent: true,
        widenClientFileUpload: true,
        webpack: {
          treeshake: {
            removeDebugLogging: true,
          },
        },
        errorHandler: (err) => {
          console.warn('Sentry source map upload warning:', err.message);
        },
      });

export default withAnalyzer(withSentry(nextConfig));
