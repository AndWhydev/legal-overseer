import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // Landing page is served at / — authenticated users can navigate to /dashboard
  // via the app's own routing. No blanket redirect.
  serverExternalPackages: [
    '@whiskeysockets/baileys',
    'jimp',
    'sharp',
    'link-preview-js',
    'voyageai',
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
  webpack: (config, { isServer }) => {
    // Force voyageai to use CJS build (ESM has broken directory imports)
    if (isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        voyageai: require.resolve('voyageai'),
      };
    }
    return config;
  },
};

export default withAnalyzer(
  withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG?.trim() || 'bitbit-d1',
    project: process.env.SENTRY_PROJECT?.trim() || 'bitbit-dashboard',
    silent: true,
    widenClientFileUpload: true,
    disableLogger: true,
    // Prevent Sentry source map upload failures from crashing production builds
    errorHandler: (err) => {
      console.warn('Sentry source map upload warning:', err.message);
    },
  })
);
