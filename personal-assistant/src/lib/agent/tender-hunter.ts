import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Tender {
  id: string
  org_id: string
  title: string
  source: string
  url: string
  value: number | null
  deadline: string | null
  status: string
  fit_score: number | null
  requirements: Record<string, unknown>
  created_at: string
}

export interface CapabilityProfile {
  id: string
  org_id: string
  name: string
  skills: string[]
  certifications: string[]
  past_projects: Array<{ title: string; value?: number; keywords?: string[] }>
}

export interface SearchTendersParams {
  keywords: string[]
  region?: string
  minValue?: number
}

export interface SearchTendersResult {
  tenders: Tender[]
  count: number
  source: string
  searchedAt: string
}

export interface EvaluateFitParams {
  tenderId: string
  capabilityProfile: Partial<CapabilityProfile>
}

export interface EvaluateFitResult {
  tenderId: string
  fitScore: number
  matchedKeywords: string[]
  gaps: string[]
  recommendation: 'pursue' | 'consider' | 'skip'
  reasoning: string
}

export interface DraftResponseParams {
  tenderId: string
}

export interface DraftResponseResult {
  tenderId: string
  tenderTitle: string
  draft: string
  sections: Array<{ title: string; content: string }>
  generatedAt: string
}

// ---------------------------------------------------------------------------
// AusTender scraping approach
// The official AusTender REST API at https://www.tenders.gov.au/api/ is not
// publicly documented. We fall back to scraping the ATM (Approach to Market)
// search page and parsing the HTML response.
// ---------------------------------------------------------------------------

const AUSTENDER_BASE = 'https://www.tenders.gov.au'
const AUSTENDER_SEARCH = `${AUSTENDER_BASE}/atm/show/search`

interface RawTenderResult {
  id: string
  title: string
  url: string
  value: number | null
  deadline: string | null
  agency: string
  category: string
}

function parseAustenderHtml(html: string): RawTenderResult[] {
  const results: RawTenderResult[] = []

  // Extract table rows from search results
  const rowPattern = /<tr[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const row = rowMatch[1]

    // Extract ATM ID and title
    const idMatch = row.match(/ATM-(\d+)/)
    const titleMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/)
    const valueMatch = row.match(/\$\s*([\d,]+(?:\.\d{2})?)/)
    const dateMatch = row.match(/(\d{2}\/\d{2}\/\d{4})/)
    const agencyMatch = row.match(/<td[^>]*class="[^"]*agency[^"]*"[^>]*>([^<]+)<\/td>/)

    if (titleMatch) {
      const rawValue = valueMatch ? valueMatch[1].replace(/,/g, '') : null
      const rawDate = dateMatch ? dateMatch[1] : null
      let deadline: string | null = null

      if (rawDate) {
        const [day, month, year] = rawDate.split('/')
        deadline = new Date(`${year}-${month}-${day}`).toISOString()
      }

      results.push({
        id: idMatch ? `ATM-${idMatch[1]}` : `tender-${Date.now()}-${results.length}`,
        title: titleMatch[2].trim(),
        url: titleMatch[1].startsWith('http')
          ? titleMatch[1]
          : `${AUSTENDER_BASE}${titleMatch[1]}`,
        value: rawValue ? parseFloat(rawValue) : null,
        deadline,
        agency: agencyMatch ? agencyMatch[1].trim() : 'Unknown agency',
        category: '',
      })
    }
  }

  return results
}

async function fetchAustenderResults(
  keywords: string[],
  region?: string,
): Promise<RawTenderResult[]> {
  const query = keywords.join(' ')
  const params = new URLSearchParams({
    keyword: query,
    publishedFrom: '',
    publishedTo: '',
    ...(region ? { state: region } : {}),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(`${AUSTENDER_SEARCH}?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BitBit/1.0; +https://bitbit.com.au)',
        Accept: 'text/html',
      },
    })

    if (!response.ok) {
      return []
    }

    const html = await response.text()
    return parseAustenderHtml(html)
  } catch {
    // Return empty on network error / timeout — callers handle gracefully
    return []
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Fit evaluation
// ---------------------------------------------------------------------------

function evaluateTenderFit(
  requirements: Record<string, unknown>,
  tenderTitle: string,
  profile: Partial<CapabilityProfile>,
): { score: number; matchedKeywords: string[]; gaps: string[] } {
  const skills = profile.skills ?? []
  const certifications = profile.certifications ?? []
  const pastProjects = profile.past_projects ?? []

  const titleWords = tenderTitle.toLowerCase().split(/\s+/)
  const reqText = JSON.stringify(requirements).toLowerCase()

  const matchedKeywords: string[] = []
  const gaps: string[] = []

  // Skill matching
  for (const skill of skills) {
    const lowerSkill = skill.toLowerCase()
    if (titleWords.some((w) => lowerSkill.includes(w) || w.includes(lowerSkill)) || reqText.includes(lowerSkill)) {
      matchedKeywords.push(skill)
    }
  }

  // Certification matching
  for (const cert of certifications) {
    if (reqText.includes(cert.toLowerCase())) {
      matchedKeywords.push(cert)
    }
  }

  // Past project relevance
  let projectBonus = 0
  for (const project of pastProjects) {
    const projectKeywords = project.keywords ?? []
    const hasMatch = projectKeywords.some((kw) =>
      titleWords.some((w) => kw.toLowerCase().includes(w)),
    )
    if (hasMatch) {
      projectBonus += 10
      matchedKeywords.push(`Similar project: ${project.title}`)
    }
  }

  // Gap detection
  const COMMON_REQUIREMENTS = ['insurance', 'government experience', 'security clearance', 'iso certification', 'abn']
  for (const req of COMMON_REQUIREMENTS) {
    if (reqText.includes(req)) {
      const covered =
        certifications.some((c) => c.toLowerCase().includes(req)) ||
        skills.some((s) => s.toLowerCase().includes(req))
      if (!covered) {
        gaps.push(req)
      }
    }
  }

  const baseScore = Math.min(80, matchedKeywords.length * 15)
  const score = Math.min(100, baseScore + projectBonus)

  return { score, matchedKeywords, gaps }
}

// ---------------------------------------------------------------------------
// Response draft generation
// ---------------------------------------------------------------------------

function buildResponseDraft(
  tender: Tender,
  profile: CapabilityProfile | null,
): Array<{ title: string; content: string }> {
  const orgName = profile?.name ?? 'Our Organisation'
  const skills = profile?.skills ?? []
  const certs = profile?.certifications ?? []

  return [
    {
      title: '1. Executive Summary',
      content: `${orgName} is pleased to submit this response to ${tender.title}. We bring proven expertise in ${skills.slice(0, 3).join(', ') || 'the required service areas'} and are committed to delivering outcomes that meet and exceed the stated requirements within the specified timeframe${tender.deadline ? ` (deadline: ${new Date(tender.deadline).toLocaleDateString('en-AU')})` : ''}.`,
    },
    {
      title: '2. Organisational Overview',
      content: `${orgName} is an Australian-registered business with a strong track record in delivering government and commercial engagements. Our team combines technical capability with a deep understanding of public-sector expectations around compliance, reporting, and value for money.`,
    },
    {
      title: '3. Understanding of Requirements',
      content: `We have reviewed the requirements for ${tender.title} in detail. Our understanding is that the primary objective is to ${JSON.stringify(tender.requirements).length > 10 ? 'deliver the services outlined in the specification' : 'fulfil the stated scope'}. We confirm our ability to meet all mandatory criteria and propose an approach that prioritises quality, timeliness, and cost efficiency.`,
    },
    {
      title: '4. Proposed Approach & Methodology',
      content: `Our methodology follows a structured four-phase approach:\n\n**Phase 1 — Discovery & Planning (Week 1–2):** Stakeholder alignment, requirements confirmation, and project plan sign-off.\n\n**Phase 2 — Delivery (Weeks 3–${tender.value && tender.value > 100000 ? '12' : '6'}):** Core deliverables executed by our specialist team, with weekly progress updates.\n\n**Phase 3 — Quality Assurance:** Peer review, compliance checks, and client review cycles.\n\n**Phase 4 — Handover & Documentation:** Full knowledge transfer, final reporting, and closure documentation.`,
    },
    {
      title: '5. Relevant Experience',
      content: `${orgName} has successfully delivered comparable engagements including:\n\n${profile?.past_projects?.slice(0, 3).map((p) => `• ${p.title}${p.value ? ` (value: $${p.value.toLocaleString()})` : ''}`).join('\n') || '• [Insert relevant project references here]'}\n\nDetailed case studies are available upon request.`,
    },
    {
      title: '6. Team & Capabilities',
      content: `Our proposed team has expertise across: ${skills.join(', ') || '[list key skills]'}.\n\nRelevant certifications held: ${certs.join(', ') || '[list certifications]'}.\n\nAll team members are Australian citizens/residents and available to commence within 2 weeks of contract award.`,
    },
    {
      title: '7. Pricing Summary',
      content: tender.value
        ? `Our proposed pricing is competitive and reflects the scope outlined in ${tender.title}. We can deliver within the estimated budget range of $${tender.value.toLocaleString()}. A detailed cost breakdown is attached as Appendix A.`
        : 'Our detailed pricing is provided in the attached Schedule of Rates. All prices are inclusive of GST and represent fixed-price commitments unless otherwise stated.',
    },
    {
      title: '8. Compliance & Declarations',
      content: `${orgName} confirms:\n• ABN: [INSERT ABN]\n• We hold appropriate public liability and professional indemnity insurance\n• We are not subject to any conflicts of interest in relation to this tender\n• All information provided is accurate and complete\n• We agree to the terms and conditions of the contract as specified`,
    },
  ]
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

export async function searchTenders(
  supabase: SupabaseClient,
  orgId: string,
  params: SearchTendersParams,
): Promise<SearchTendersResult> {
  const { keywords, region, minValue } = params

  // Fetch from AusTender
  const raw = await fetchAustenderResults(keywords, region)

  // Filter by minimum value
  const filtered = raw.filter((t) => {
    if (minValue !== undefined && t.value !== null && t.value < minValue) return false
    return true
  })

  // Upsert into DB
  const tenders: Tender[] = []
  for (const raw of filtered) {
    const tenderRow = {
      org_id: orgId,
      title: raw.title,
      source: 'austender',
      url: raw.url,
      value: raw.value,
      deadline: raw.deadline,
      status: 'open',
      fit_score: null,
      requirements: { agency: raw.agency, category: raw.category },
    }

    const { data, error } = await supabase
      .from('tenders')
      .upsert(tenderRow, { onConflict: 'org_id,url' })
      .select()
      .single()

    if (!error && data) {
      tenders.push(data as Tender)
    }
  }

  return {
    tenders,
    count: tenders.length,
    source: 'austender',
    searchedAt: new Date().toISOString(),
  }
}

export async function evaluateFit(
  supabase: SupabaseClient,
  orgId: string,
  params: EvaluateFitParams,
): Promise<EvaluateFitResult> {
  const { tenderId, capabilityProfile } = params

  // Fetch tender
  const { data: tenderData, error: tenderError } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .eq('org_id', orgId)
    .single()

  if (tenderError || !tenderData) {
    throw new Error(tenderError?.message ?? `Tender ${tenderId} not found`)
  }

  const tender = tenderData as Tender
  const { score, matchedKeywords, gaps } = evaluateTenderFit(
    tender.requirements,
    tender.title,
    capabilityProfile,
  )

  // Update fit score in DB
  await supabase
    .from('tenders')
    .update({ fit_score: score })
    .eq('id', tenderId)
    .eq('org_id', orgId)

  const recommendation: EvaluateFitResult['recommendation'] =
    score >= 65 ? 'pursue' : score >= 40 ? 'consider' : 'skip'

  const reasoning =
    score >= 65
      ? `Strong keyword and capability alignment (${matchedKeywords.length} matches). ${gaps.length > 0 ? `Address gaps: ${gaps.join(', ')}.` : 'No critical gaps identified.'}`
      : score >= 40
      ? `Partial match — worth exploring but gaps exist: ${gaps.join(', ') || 'general capability gaps'}. Consider partnering to strengthen the bid.`
      : `Low alignment (score ${score}/100). Insufficient capability or keyword match. Resources better allocated elsewhere.`

  return {
    tenderId,
    fitScore: score,
    matchedKeywords,
    gaps,
    recommendation,
    reasoning,
  }
}

export async function draftResponse(
  supabase: SupabaseClient,
  orgId: string,
  params: DraftResponseParams,
): Promise<DraftResponseResult> {
  const { tenderId } = params

  // Fetch tender
  const { data: tenderData, error: tenderError } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .eq('org_id', orgId)
    .single()

  if (tenderError || !tenderData) {
    throw new Error(tenderError?.message ?? `Tender ${tenderId} not found`)
  }

  const tender = tenderData as Tender

  // Fetch capability profile (use first active one for org)
  const { data: profileData } = await supabase
    .from('capability_profiles')
    .select('*')
    .eq('org_id', orgId)
    .limit(1)
    .single()

  const profile = profileData as CapabilityProfile | null
  const sections = buildResponseDraft(tender, profile)

  const draft = sections.map((s) => `# ${s.title}\n\n${s.content}`).join('\n\n---\n\n')

  return {
    tenderId,
    tenderTitle: tender.title,
    draft,
    sections,
    generatedAt: new Date().toISOString(),
  }
}
