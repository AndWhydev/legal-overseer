import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://bitbit.chat'

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/pricing',
          '/privacy',
          '/terms',
          '/onboard',
          '/case-study',
          '/industries/agencies',
          '/industries/trades',
          '/industries/professional-services',
        ],
        disallow: [
          '/dashboard',
          '/api',
          '/admin',
          '/*.json$',
          '/*.json?*',
        ],
      },
      {
        userAgent: 'AdsBot-Google',
        allow: '/',
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
