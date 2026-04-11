import Anthropic from '@anthropic-ai/sdk'
import type { AgentToolHandler, ToolResult } from '../tools'

// ---------------------------------------------------------------------------
// Platform-specific formatting conventions
// ---------------------------------------------------------------------------

const PLATFORM_CONVENTIONS: Record<string, string> = {
  linkedin: `LinkedIn post conventions:
- Professional, thought-leadership tone
- 1300 character limit (ideal: 800-1200)
- Use line breaks between paragraphs for readability
- Open with a bold statement or insight
- 3-5 relevant hashtags at the end, each on the same line
- No emojis unless the brand voice explicitly uses them
- End with a question or call-to-action to encourage engagement`,

  instagram: `Instagram post conventions:
- Engaging, visual-first copy that complements imagery
- 2200 character limit (ideal: 1000-1500 for body)
- Emoji encouraged to add personality and break up text
- First line is the hook -- must stop the scroll
- 20-30 relevant hashtags in a block at the end (separated from body by line breaks)
- Mix popular, niche, and branded hashtags
- Include a call-to-action (link in bio, save this post, tag a friend)`,

  x: `X (Twitter) post conventions:
- Concise, punchy copy -- HARD LIMIT of 280 characters total
- No fluff, every word must earn its place
- 1-3 hashtags inline (not at the end), only if they add value
- Use a strong hook or hot take
- Threads allowed but this is a single tweet
- Contractions and abbreviations are fine`,
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export const contentToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'schedule_post',
    description:
      'Generate a social media post formatted for a specific platform. LinkedIn gets professional tone with line breaks and thought-leadership framing. Instagram gets visual-first copy with emoji and 20-30 hashtags. X (Twitter) gets concise copy under 280 characters with 2-3 hashtags.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'What the post is about -- product launch, thought piece, announcement, etc.',
        },
        platform: {
          type: 'string',
          enum: ['linkedin', 'instagram', 'x'],
          description: 'Target social media platform',
        },
        tone: {
          type: 'string',
          description: 'Desired tone -- professional, casual, witty, bold. If not specified, uses platform default',
        },
        include_hashtags: {
          type: 'boolean',
          description: 'Whether to include hashtags (default: true)',
        },
        brand_context: {
          type: 'string',
          description: 'Brand voice description or company context for consistency',
        },
      },
      required: ['topic', 'platform'],
    },
  },
  {
    name: 'generate_blog',
    description:
      'Generate a blog post draft with SEO optimization. Produces a structured draft with title, meta description, body with H2/H3 sections, and keyword integration. Default ~800 words, adjustable.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'The blog post topic or title idea',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'SEO keywords to weave into the content naturally',
        },
        tone: {
          type: 'string',
          description: 'Writing tone -- authoritative, conversational, educational, etc.',
        },
        word_count: {
          type: 'number',
          description: 'Target word count (default: 800)',
        },
        brand_context: {
          type: 'string',
          description: 'Brand voice description or company context for consistency',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'content_calendar',
    description:
      'View the content calendar showing recently generated and upcoming content drafts. Shows post title/topic, platform, status, and creation date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back (default: 30)',
        },
        platform: {
          type: 'string',
          description: 'Filter by platform (optional)',
        },
      },
    },
  },
]

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

const anthropic = new Anthropic()

export const contentToolHandlers: Record<string, AgentToolHandler> = {
  async schedule_post(input, _orgId, _supabase): Promise<ToolResult> {
    try {
      const topic = input.topic as string
      const platform = input.platform as 'linkedin' | 'instagram' | 'x'
      const tone = input.tone as string | undefined
      const includeHashtags = (input.include_hashtags as boolean) ?? true
      const brandContext = input.brand_context as string | undefined

      const platformConventions = PLATFORM_CONVENTIONS[platform]
      let systemPrompt = `You are a social media content expert. Generate a single post for the specified platform.

${platformConventions}

${tone ? `Tone: ${tone}` : ''}
${includeHashtags === false ? 'Do NOT include any hashtags.' : ''}

Respond ONLY with valid JSON in this exact format:
{
  "post": "the full post text",
  "platform": "${platform}",
  "charCount": <number of characters in the post>,
  "hashtagCount": <number of hashtags in the post>
}`

      if (brandContext) {
        systemPrompt += `\n\nBrand voice context: ${brandContext}`
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Write a ${platform} post about: ${topic}`,
          },
        ],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return { success: false, error: 'Failed to parse structured response from LLM' }
      }

      const parsed = JSON.parse(jsonMatch[0])
      return {
        success: true,
        data: {
          post: parsed.post,
          platform: parsed.platform || platform,
          charCount: parsed.charCount || parsed.post.length,
          hashtagCount: parsed.hashtagCount || (parsed.post.match(/#/g) || []).length,
        },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async generate_blog(input, _orgId, _supabase): Promise<ToolResult> {
    try {
      const topic = input.topic as string
      const keywords = (input.keywords as string[]) || []
      const tone = input.tone as string | undefined
      const wordCount = (input.word_count as number) || 800
      const brandContext = input.brand_context as string | undefined

      let systemPrompt = `You are an expert blog writer and SEO specialist. Generate a structured blog post draft.

SEO best practices:
- Title: compelling, includes primary keyword, under 60 characters ideal
- Meta description: 150-160 characters, includes primary keyword, actionable
- Body: use H2 and H3 headings for structure, natural keyword integration (1-2% density)
- Include internal linking suggestions where relevant
- Target approximately ${wordCount} words

${tone ? `Writing tone: ${tone}` : 'Writing tone: authoritative yet accessible'}
${brandContext ? `Brand voice context: ${brandContext}` : ''}
${keywords.length > 0 ? `Target keywords to integrate naturally: ${keywords.join(', ')}` : ''}

Respond ONLY with valid JSON in this exact format:
{
  "title": "Blog post title",
  "meta_description": "150-160 char meta description",
  "body": "Full blog body in markdown with ## and ### headings",
  "keywords_used": ["keyword1", "keyword2"],
  "word_count": <approximate word count>,
  "seo_suggestions": ["suggestion 1", "suggestion 2"]
}`

      const userMessage = keywords.length > 0
        ? `Write a blog post about: ${topic}\n\nKeywords to include: ${keywords.join(', ')}`
        : `Write a blog post about: ${topic}`

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return { success: false, error: 'Failed to parse structured response from LLM' }
      }

      const parsed = JSON.parse(jsonMatch[0])
      return {
        success: true,
        data: {
          title: parsed.title,
          meta_description: parsed.meta_description,
          body: parsed.body,
          keywords_used: parsed.keywords_used || keywords,
          word_count: parsed.word_count || 0,
          seo_suggestions: parsed.seo_suggestions || [],
        },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async content_calendar(input, _orgId, _supabase): Promise<ToolResult> {
    try {
      // In v1.4, there is no content_drafts table yet.
      // Return an empty calendar with helpful guidance.
      // Future versions will query agent_run_logs for content tool executions
      // or a dedicated content_drafts table.
      const _days = (input.days as number) || 30
      const _platform = input.platform as string | undefined

      return {
        success: true,
        data: {
          items: [] as Array<{ topic: string; platform: string; status: string; created_at: string }>,
          total: 0,
          message: 'No content scheduled yet. Use schedule_post to generate social media posts or generate_blog to create blog drafts. A content calendar with persistence will be available in a future update.',
        },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}
