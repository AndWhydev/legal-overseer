import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/core/logger'
import { resolveModel } from '@/lib/agent/model-registry'
import Anthropic from '@anthropic-ai/sdk'

const TEMPLATE_TYPES = ['ad_scripts', 'social_posts', 'email_campaigns', 'blog_posts'] as const

interface GenerateRequest {
  template_type: string
  inputs: {
    product_name: string
    target_audience: string
    tone: 'professional' | 'casual' | 'playful'
    length: 'short' | 'medium' | 'long'
  }
}

const TEMPLATE_PROMPTS: Record<string, (inputs: GenerateRequest['inputs']) => string> = {
  ad_scripts: (inputs) =>
    `Write a compelling ${inputs.length} ad script for "${inputs.product_name}" targeting "${inputs.target_audience}" with a ${inputs.tone} tone. Make it engaging and conversion-focused. Format with scene/action notes if appropriate.`,
  social_posts: (inputs) =>
    `Create a ${inputs.length} social media post for "${inputs.product_name}" that appeals to "${inputs.target_audience}" in a ${inputs.tone} voice. Include relevant hashtags at the end.`,
  email_campaigns: (inputs) =>
    `Compose a ${inputs.length} email campaign for "${inputs.product_name}" targeting "${inputs.target_audience}" with a ${inputs.tone} tone. Start with "Subject: " then a blank line, then the email body.`,
  blog_posts: (inputs) =>
    `Write a ${inputs.length} blog post for "${inputs.product_name}" that would interest "${inputs.target_audience}". Use a ${inputs.tone} tone. Include an engaging title, introduction, 3-5 main sections with headings, and a conclusion.`,
}

async function getOrgContext() {
  const supabase = await createClient()
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return null
  return { supabase, userId: user.id, orgId: profile.org_id }
}

export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body: GenerateRequest = await request.json()

    if (!TEMPLATE_TYPES.includes(body.template_type as (typeof TEMPLATE_TYPES)[number])) {
      return NextResponse.json(
        { error: `Invalid template_type. Must be one of: ${TEMPLATE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    if (!body.inputs?.product_name || !body.inputs?.target_audience) {
      return NextResponse.json(
        { error: 'Missing required fields: product_name, target_audience' },
        { status: 400 }
      )
    }

    const inputs = {
      product_name: body.inputs.product_name,
      target_audience: body.inputs.target_audience,
      tone: body.inputs.tone || 'professional',
      length: body.inputs.length || 'medium',
    }

    const client = new Anthropic()
    const prompt = TEMPLATE_PROMPTS[body.template_type](inputs)

    const message = await client.messages.create({
      model: resolveModel('classification'), // Haiku — fast, cheap
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const output =
      message.content[0]?.type === 'text'
        ? message.content[0].text
        : 'Failed to generate content'

    const { data, error } = await ctx.supabase
      .from('generated_content')
      .insert({
        org_id: ctx.orgId,
        template_type: body.template_type,
        inputs: body.inputs,
        output,
        status: 'draft',
      })
      .select()
      .single()

    if (error) {
      logger.error('[creator-studio] Failed to store generated content:', error)
      return NextResponse.json({ error: 'Failed to save generated content' }, { status: 500 })
    }

    return NextResponse.json(
      {
        id: data.id,
        output: data.output,
        template_type: data.template_type,
        status: data.status,
        created_at: data.created_at,
      },
      { status: 201 }
    )
  } catch (err) {
    logger.error('[creator-studio] Generate failed:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Try again in a moment.' },
      { status: 500 }
    )
  }
}
