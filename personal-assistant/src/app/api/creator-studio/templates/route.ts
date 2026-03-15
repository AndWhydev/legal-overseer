import { NextResponse } from 'next/server'

const TEMPLATES = [
  {
    id: 'ad_scripts',
    label: 'Ad Scripts',
    description: 'Generate compelling video and ad copy for social media, YouTube, and display ads',
    icon: 'Film',
  },
  {
    id: 'social_posts',
    label: 'Social Posts',
    description: 'Create engaging posts optimized for Instagram, X, LinkedIn, and TikTok',
    icon: 'Share2',
  },
  {
    id: 'email_campaigns',
    label: 'Email Campaigns',
    description: 'Write subject lines, email body, and campaign sequences that convert',
    icon: 'Mail',
  },
  {
    id: 'blog_posts',
    label: 'Blog Posts',
    description: 'Generate blog post outlines, introductions, and full articles for your audience',
    icon: 'FileText',
  },
]

export async function GET() {
  return NextResponse.json({
    templates: TEMPLATES,
  })
}
