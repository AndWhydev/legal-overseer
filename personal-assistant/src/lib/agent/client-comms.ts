import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { loadVoiceProfile as loadVoiceProfileFromDisk } from './voice-loader'

export interface VoiceProfile {
  id: string
  org_id: string
  name: string
  tone: string
  style_guide: string
  greeting_templates: string[]
  sign_off: string
  avoid_phrases: string[]
}

export interface DraftRequest {
  contactSlug: string
  incomingMessage: string
  channel: 'email' | 'whatsapp' | 'sms'
  replyType?: 'acknowledgment' | 'update' | 'followup' | 'payment_reminder'
}

export interface DraftedReply {
  subject?: string
  body: string
  voice: string
  confidence: number
}

const TEMPLATES: Record<string, string> = {
  onboarding: `Hi {name},

Welcome to {org}! We're excited to get started on your project.

Here's what happens next:
1. We'll schedule a kickoff call to align on goals
2. You'll receive a request for any credentials we need
3. We'll set up your project workspace

Looking forward to working together!

{sign_off}`,

  milestone: `Hi {name},

Quick update on your project — we've hit a milestone:

{milestone_details}

Next steps: {next_steps}

{sign_off}`,

  payment_reminder_friendly: `Hi {name},

Just a friendly reminder that invoice {invoice_ref} ({amount}) is due {due_date}.

You can pay via the link in the original invoice email, or let me know if you need it resent.

{sign_off}`,

  payment_reminder_firm: `Hi {name},

Following up on invoice {invoice_ref} ({amount}), which was due on {due_date}. This is now {days_overdue} days overdue.

Could you please arrange payment at your earliest convenience? If there are any issues, happy to discuss.

{sign_off}`,
}

export async function loadVoiceProfile(
  supabase: SupabaseClient,
  orgId: string,
  profileName?: string
): Promise<VoiceProfile | null> {
  let query = supabase
    .from('voice_profiles')
    .select('*')
    .eq('org_id', orgId)

  if (profileName) {
    query = query.eq('name', profileName)
  } else {
    query = query.limit(1)
  }

  const { data } = await query
  return data?.[0] || null
}

export async function draftReply(
  supabase: SupabaseClient,
  orgId: string,
  request: DraftRequest
): Promise<DraftedReply> {
  // Load voice profile
  const voice = await loadVoiceProfile(supabase, orgId)

  // Resolve contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('name, communication_patterns')
    .eq('org_id', orgId)
    .eq('slug', request.contactSlug)
    .single()

  const contactName = contact?.name || request.contactSlug
  const tone = voice?.tone || 'professional and friendly'
  const signOff = voice?.sign_off || 'Best regards'

  // Select template if applicable
  let body: string
  if (request.replyType && TEMPLATES[request.replyType]) {
    body = TEMPLATES[request.replyType]
      .replace(/{name}/g, contactName)
      .replace(/{org}/g, 'All Webbed Up')
      .replace(/{sign_off}/g, signOff)
  } else {
    // Try LLM-based contextual reply with voice profile
    body = await generateContextualReplyWithLLM(
      contactName,
      request.incomingMessage,
      voice?.tone || tone,
      voice?.style_guide || '',
      signOff,
      request.channel
    )
  }

  return {
    subject: request.channel === 'email' ? `Re: ${contactName}` : undefined,
    body,
    voice: voice?.name || 'default',
    confidence: 0.7,
  }
}

async function generateContextualReplyWithLLM(
  name: string,
  incoming: string,
  tone: string,
  styleGuide: string,
  signOff: string,
  channel: 'email' | 'whatsapp' | 'sms'
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Fallback to pattern-based if API key not available
    return generateContextualReplyFallback(name, incoming, tone, signOff)
  }

  try {
    // Load deployment voice profile for additional context
    const deploymentSlug = process.env.BITBIT_DEPLOYMENT || 'awu'
    const voiceProfileText = await loadVoiceProfileFromDisk(deploymentSlug)

    const client = new Anthropic({ apiKey })

    const systemPrompt = `You are a professional communication assistant drafting ${channel} replies in the voice of an organization's team member.

Tone: ${tone}
${styleGuide ? `Style Guide: ${styleGuide}` : ''}
${voiceProfileText ? `Voice Profile:\n${voiceProfileText}` : ''}

Draft a brief, natural reply to the incoming message. Keep it concise and friendly. End with "${signOff}".`

    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Reply to this message from ${name}:\n\n${incoming}`,
        },
      ],
      system: systemPrompt,
    })

    const content = message.content[0]
    if (content.type === 'text') {
      return content.text
    }

    // Fallback if response is not text
    return generateContextualReplyFallback(name, incoming, tone, signOff)
  } catch {
    // Fallback to pattern-based on LLM error
    return generateContextualReplyFallback(name, incoming, tone, signOff)
  }
}

function generateContextualReplyFallback(
  name: string,
  incoming: string,
  tone: string,
  signOff: string
): string {
  // Fallback pattern-based reply generation
  const lower = incoming.toLowerCase()

  if (lower.includes('when') || lower.includes('timeline') || lower.includes('eta')) {
    return `Hi ${name},\n\nThanks for checking in. Let me get an update on the timeline and get back to you shortly.\n\n${signOff}`
  }

  if (lower.includes('invoice') || lower.includes('payment') || lower.includes('cost')) {
    return `Hi ${name},\n\nThanks for reaching out about billing. I'll pull up the details and send through an update.\n\n${signOff}`
  }

  if (lower.includes('issue') || lower.includes('bug') || lower.includes('problem') || lower.includes('broken')) {
    return `Hi ${name},\n\nThanks for flagging this. I'm looking into it now and will get back to you with an update ASAP.\n\n${signOff}`
  }

  return `Hi ${name},\n\nThanks for your message. I'll review and get back to you shortly.\n\n${signOff}`
}

export async function getTemplate(name: string): Promise<string | null> {
  return TEMPLATES[name] || null
}

export const clientComms = {
  draftReply,
  loadVoiceProfile,
  getTemplate,
}
