import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToneProfile } from './comms-role'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToneAdaptation {
  originalDraft: string
  adaptedDraft: string
  profileApplied: ToneProfile | null
  adaptations: string[]
}

// ---------------------------------------------------------------------------
// Tone Learning
// ---------------------------------------------------------------------------

/**
 * Analyze historical messages from a contact to learn their communication
 * style. Examines formality, verbosity, greetings, sign-offs, and
 * characteristic phrases.
 *
 * Returns a ToneProfile that can be stored in CommsState for future use.
 */
export async function learnClientTone(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<ToneProfile | null> {
  const tag = `[tone-adapter:${orgId.slice(0, 8)}]`

  // Get recent messages from this contact (inbound only)
  const { data: messages, error } = await supabase
    .from('channel_messages')
    .select('body, subject, metadata')
    .eq('org_id', orgId)
    .eq('processed', true)
    .order('received_at', { ascending: false })
    .limit(20)

  if (error || !messages) {
    logger.warn(`${tag} Could not fetch messages for tone learning: ${error?.message}`)
    return null
  }

  // Filter to messages from this specific contact
  const contactMessages = messages.filter(msg => {
    const meta = (msg.metadata || {}) as Record<string, unknown>
    return meta.contact_id === contactId
  })

  if (contactMessages.length < 3) {
    // Not enough data to learn tone
    return null
  }

  // Analyze formality
  const bodies = contactMessages.map(m => String(m.body || '')).filter(b => b.length > 10)
  const formality = analyzeFormality(bodies)
  const verbosity = analyzeVerbosity(bodies)
  const greeting = detectGreetingPattern(bodies)
  const signOff = detectSignOffPattern(bodies)
  const samplePhrases = extractCharacteristicPhrases(bodies)

  const profile: ToneProfile = {
    formality,
    verbosity,
    preferredGreeting: greeting,
    preferredSignOff: signOff,
    samplePhrases,
    lastUpdated: new Date().toISOString(),
  }

  logger.info(
    `${tag} Learned tone for contact ${contactId.slice(0, 8)}: ` +
    `${formality}/${verbosity}, greeting="${greeting}", signOff="${signOff}"`,
  )

  return profile
}

// ---------------------------------------------------------------------------
// Tone Adaptation
// ---------------------------------------------------------------------------

/**
 * Adapt a draft response to match a contact's communication style.
 * Adjusts formality level, verbosity, and greeting/sign-off patterns.
 */
export function adaptDraft(
  draft: string,
  profile: ToneProfile | null,
): ToneAdaptation {
  if (!profile) {
    return {
      originalDraft: draft,
      adaptedDraft: draft,
      profileApplied: null,
      adaptations: [],
    }
  }

  let adapted = draft
  const adaptations: string[] = []

  // Adapt formality
  if (profile.formality === 'casual') {
    // Replace formal greetings with casual ones
    adapted = adapted.replace(/^Dear\s+/m, profile.preferredGreeting ? `${profile.preferredGreeting} ` : 'Hey ')
    adapted = adapted.replace(/^Good (morning|afternoon|evening),?\s*/m, profile.preferredGreeting ? `${profile.preferredGreeting} ` : 'Hey ')
    if (adapted !== draft) adaptations.push('casualized greeting')

    // Replace formal sign-offs
    const formalSignOffs = ['Kind regards', 'Best regards', 'Sincerely', 'Yours sincerely', 'Respectfully']
    for (const signOff of formalSignOffs) {
      if (adapted.includes(signOff)) {
        adapted = adapted.replace(signOff, profile.preferredSignOff || 'Cheers')
        adaptations.push('casualized sign-off')
        break
      }
    }
  } else if (profile.formality === 'formal') {
    // Replace casual greetings with formal ones
    adapted = adapted.replace(/^(Hey|Hi|Heya|Yo)\s+/m, profile.preferredGreeting ? `${profile.preferredGreeting} ` : 'Dear ')
    if (adapted !== draft) adaptations.push('formalized greeting')

    // Replace casual sign-offs
    const casualSignOffs = ['Cheers', 'Thanks!', 'Catch you later', 'Talk soon', 'Later']
    for (const signOff of casualSignOffs) {
      if (adapted.includes(signOff)) {
        adapted = adapted.replace(signOff, profile.preferredSignOff || 'Kind regards')
        adaptations.push('formalized sign-off')
        break
      }
    }
  }

  // Adapt verbosity
  if (profile.verbosity === 'concise' && adapted.length > 300) {
    // Try to shorten by removing filler phrases
    const fillers = [
      'I hope this email finds you well. ',
      'I hope you are doing well. ',
      'Just wanted to reach out to ',
      'I wanted to let you know that ',
      'Please do not hesitate to ',
      'Please don\'t hesitate to ',
    ]
    for (const filler of fillers) {
      if (adapted.includes(filler)) {
        adapted = adapted.replace(filler, '')
        adaptations.push('removed filler phrase')
      }
    }
  }

  // Apply preferred greeting if set and not already adapted
  if (profile.preferredGreeting && !adaptations.some(a => a.includes('greeting'))) {
    const greetingPattern = /^(Hi|Hey|Hello|Dear|Good (?:morning|afternoon|evening)),?\s*/m
    if (greetingPattern.test(adapted)) {
      adapted = adapted.replace(greetingPattern, `${profile.preferredGreeting} `)
      adaptations.push('applied preferred greeting')
    }
  }

  return {
    originalDraft: draft,
    adaptedDraft: adapted,
    profileApplied: profile,
    adaptations,
  }
}

// ---------------------------------------------------------------------------
// Analysis Helpers
// ---------------------------------------------------------------------------

function analyzeFormality(bodies: string[]): ToneProfile['formality'] {
  let formalScore = 0
  let casualScore = 0

  for (const body of bodies) {
    const lower = body.toLowerCase()

    // Formal indicators
    if (lower.includes('dear ')) formalScore += 2
    if (lower.includes('sincerely')) formalScore += 2
    if (lower.includes('kind regards')) formalScore += 2
    if (lower.includes('respectfully')) formalScore += 2
    if (lower.includes('please find attached')) formalScore += 1
    if (lower.includes('i would like to')) formalScore += 1

    // Casual indicators
    if (lower.includes('hey ')) casualScore += 2
    if (lower.includes('cheers')) casualScore += 2
    if (lower.includes('thanks!')) casualScore += 1
    if (lower.includes('haha') || lower.includes('lol')) casualScore += 2
    if (/!!+/.test(body)) casualScore += 1
    if (/:\)|;\)|:D/.test(body)) casualScore += 1
    if (lower.includes('gonna') || lower.includes('wanna')) casualScore += 1
  }

  if (formalScore > casualScore * 1.5) return 'formal'
  if (casualScore > formalScore * 1.5) return 'casual'
  return 'neutral'
}

function analyzeVerbosity(bodies: string[]): ToneProfile['verbosity'] {
  const avgLength = bodies.reduce((sum, b) => sum + b.length, 0) / bodies.length

  if (avgLength < 100) return 'concise'
  if (avgLength > 400) return 'verbose'
  return 'moderate'
}

function detectGreetingPattern(bodies: string[]): string | null {
  const greetings = new Map<string, number>()

  for (const body of bodies) {
    const firstLine = body.split('\n')[0].trim()
    const match = firstLine.match(/^(Hi|Hey|Hello|Dear|Good morning|Good afternoon|G'day|Howdy),?\s*/i)
    if (match) {
      const greeting = match[1]
      greetings.set(greeting, (greetings.get(greeting) ?? 0) + 1)
    }
  }

  if (greetings.size === 0) return null

  // Return most common greeting
  let maxCount = 0
  let mostCommon: string | null = null
  for (const [greeting, count] of greetings) {
    if (count > maxCount) {
      maxCount = count
      mostCommon = greeting
    }
  }

  return mostCommon
}

function detectSignOffPattern(bodies: string[]): string | null {
  const signOffs = new Map<string, number>()

  for (const body of bodies) {
    const lines = body.trim().split('\n')
    // Check last few lines for sign-off patterns
    const lastLines = lines.slice(-3).join(' ')
    const match = lastLines.match(/(Cheers|Thanks|Best|Kind regards|Regards|Sincerely|Best regards|Talk soon|Catch you later|Ta|Warmly)/i)
    if (match) {
      const signOff = match[1]
      signOffs.set(signOff, (signOffs.get(signOff) ?? 0) + 1)
    }
  }

  if (signOffs.size === 0) return null

  let maxCount = 0
  let mostCommon: string | null = null
  for (const [signOff, count] of signOffs) {
    if (count > maxCount) {
      maxCount = count
      mostCommon = signOff
    }
  }

  return mostCommon
}

function extractCharacteristicPhrases(bodies: string[]): string[] {
  // Extract phrases that appear in multiple messages (characteristic of this sender)
  const phraseCount = new Map<string, number>()

  for (const body of bodies) {
    const sentences = body.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10 && s.length < 80)
    for (const sentence of sentences) {
      // Normalize: lowercase, collapse whitespace
      const normalized = sentence.toLowerCase().replace(/\s+/g, ' ')
      phraseCount.set(normalized, (phraseCount.get(normalized) ?? 0) + 1)
    }
  }

  // Return phrases that appear in 2+ messages (characteristic patterns)
  const characteristic: string[] = []
  for (const [phrase, count] of phraseCount) {
    if (count >= 2) {
      characteristic.push(phrase)
    }
  }

  return characteristic.slice(0, 5) // Keep top 5
}
