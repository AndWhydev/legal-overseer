import type { SupabaseClient } from '@supabase/supabase-js'
import { scrapeAllSources, upsertScrapedTenders } from './tender-sources'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Tender {
  id: string
  org_id: string
  title: string
  source: string
  tender_number: string | null
  url: string
  description: string
  category: string
  value: number | null
  budget_min: number | null
  budget_max: number | null
  deadline: string | null
  status: string
  fit_score: number | null
  requirements: Record<string, unknown>
  raw_data: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CapabilityProfile {
  id: string
  org_id: string
  name: string
  service_category: string
  description: string
  skills: string[]
  certifications: string[]
  past_projects: Array<{ title: string; value?: number; keywords?: string[] }>
  location_coverage: string[]
  max_contract_value: number | null
}

export interface TenderResponse {
  id: string
  org_id: string
  tender_id: string
  status: 'draft' | 'review' | 'submitted' | 'won' | 'lost'
  content: TenderResponseContent
  compliance_score: number | null
  fit_score: number | null
  estimated_effort_hours: number | null
  created_at: string
  updated_at: string
}

export interface TenderResponseContent {
  sections: Array<{ title: string; content: string }>
  requirements_checklist: RequirementItem[]
  compliance_matrix: ComplianceItem[]
}

export interface RequirementItem {
  id: string
  description: string
  type: 'mandatory' | 'desirable'
  weight: number
  source_text: string
}

export interface ComplianceItem {
  requirement_id: string
  requirement: string
  status: 'met' | 'partially_met' | 'not_met'
  evidence: string
  notes: string
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

export interface TenderFitScore {
  tenderId: string
  fitScore: number
  complianceScore: number
  effortVsValue: number
  winProbability: number
  recommendation: 'pursue' | 'consider' | 'skip'
  reasoning: string
  matchedKeywords: string[]
  gaps: string[]
}

export interface TenderHunterTickResult {
  scanned: number
  newTenders: number
  evaluated: number
  errors: number
}

// ---------------------------------------------------------------------------
// Search tenders (on-demand scan)
// ---------------------------------------------------------------------------

export async function searchTenders(
  supabase: SupabaseClient,
  orgId: string,
  params: SearchTendersParams,
): Promise<SearchTendersResult> {
  const { keywords, minValue } = params

  const { tenders: scraped } = await scrapeAllSources(supabase, orgId, keywords)

  // Filter by minimum value
  const filtered = scraped.filter((t) => {
    if (minValue !== undefined && t.value !== null && t.value < minValue) return false
    return true
  })

  // Upsert into DB
  await upsertScrapedTenders(supabase, orgId, filtered)

  // Return from DB for consistent shape
  const { data } = await supabase
    .from('tenders')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(50)

  const tenders = (data ?? []) as Tender[]

  return {
    tenders,
    count: tenders.length,
    source: 'all',
    searchedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Filter tenders against capability profiles
// ---------------------------------------------------------------------------

export async function filterTenders(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Tender[]> {
  // Fetch capability profiles
  const { data: profiles } = await supabase
    .from('capability_profiles')
    .select('*')
    .eq('org_id', orgId)

  const caps = (profiles ?? []) as CapabilityProfile[]

  // Fetch open tenders
  const { data: tenders } = await supabase
    .from('tenders')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'open')
    .order('deadline', { ascending: true })

  if (!tenders || tenders.length === 0) return []

  const now = new Date()
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const filtered: Tender[] = []

  for (const tender of tenders as Tender[]) {
    // Filter: closing date > 7 days out
    if (tender.deadline) {
      const deadline = new Date(tender.deadline)
      if (deadline < sevenDaysOut) continue
    }

    // Score relevance against capability profiles
    let bestScore = 0
    for (const cap of caps) {
      const score = calculateProfileMatch(tender, cap)
      bestScore = Math.max(bestScore, score)
    }

    // Update fit score in DB
    if (bestScore > 0) {
      await supabase
        .from('tenders')
        .update({ fit_score: bestScore })
        .eq('id', tender.id)
        .eq('org_id', orgId)
    }

    tender.fit_score = bestScore
    filtered.push(tender)
  }

  // Sort by fit score descending
  filtered.sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))

  return filtered
}

function calculateProfileMatch(tender: Tender, profile: CapabilityProfile): number {
  let score = 0
  const tenderText = `${tender.title} ${tender.description} ${tender.category}`.toLowerCase()

  // Service category match
  if (profile.service_category && tenderText.includes(profile.service_category.toLowerCase())) {
    score += 25
  }

  // Skills match
  for (const skill of profile.skills) {
    if (tenderText.includes(skill.toLowerCase())) {
      score += 10
    }
  }

  // Certification match
  for (const cert of profile.certifications) {
    if (tenderText.includes(cert.toLowerCase())) {
      score += 10
    }
  }

  // Past project relevance
  for (const project of profile.past_projects) {
    const projectKeywords = project.keywords ?? []
    const titleWords = tender.title.toLowerCase().split(/\s+/)
    const hasMatch = projectKeywords.some((kw) =>
      titleWords.some((w) => kw.toLowerCase().includes(w) || w.includes(kw.toLowerCase())),
    )
    if (hasMatch) score += 15
  }

  // Contract value range check
  if (profile.max_contract_value && tender.value) {
    if (tender.value <= profile.max_contract_value) {
      score += 10
    } else {
      score -= 15 // Penalty for exceeding capacity
    }
  }

  // Location coverage
  if (profile.location_coverage.length > 0) {
    const tenderLocation = (tender.raw_data?.state as string)?.toLowerCase() ?? ''
    const hasLocationMatch = profile.location_coverage.some((loc) =>
      tenderLocation.includes(loc.toLowerCase()) || loc.toLowerCase() === 'national',
    )
    if (hasLocationMatch) score += 10
  }

  return Math.max(0, Math.min(100, score))
}

// ---------------------------------------------------------------------------
// Requirement extraction (uses Sonnet via structured prompt)
// ---------------------------------------------------------------------------

export async function extractRequirements(
  supabase: SupabaseClient,
  orgId: string,
  tenderId: string,
): Promise<RequirementItem[]> {
  const { data: tender, error } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .eq('org_id', orgId)
    .single()

  if (error || !tender) {
    throw new Error(error?.message ?? `Tender ${tenderId} not found`)
  }

  const tenderData = tender as Tender
  const text = `${tenderData.title}\n${tenderData.description}\n${JSON.stringify(tenderData.requirements)}`

  // Extract requirements using pattern matching (Sonnet call would go here in production)
  const requirements = extractRequirementsFromText(text)

  // Store extracted requirements back on tender
  await supabase
    .from('tenders')
    .update({
      requirements: {
        ...tenderData.requirements,
        extracted: requirements,
      },
    })
    .eq('id', tenderId)
    .eq('org_id', orgId)

  return requirements
}

function extractRequirementsFromText(text: string): RequirementItem[] {
  const requirements: RequirementItem[] = []
  const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean)

  const MANDATORY_PATTERNS = [
    /\bmust\b/i,
    /\brequired\b/i,
    /\bshall\b/i,
    /\bmandatory\b/i,
    /\bessential\b/i,
    /\bcompulsory\b/i,
  ]

  const DESIRABLE_PATTERNS = [
    /\bdesirable\b/i,
    /\bpreferred\b/i,
    /\badvantage\b/i,
    /\bideally\b/i,
    /\bnice to have\b/i,
  ]

  let reqIndex = 0
  for (const line of lines) {
    if (line.length < 15) continue // Skip short lines

    const isMandatory = MANDATORY_PATTERNS.some((p) => p.test(line))
    const isDesirable = DESIRABLE_PATTERNS.some((p) => p.test(line))

    if (isMandatory || isDesirable) {
      reqIndex += 1
      requirements.push({
        id: `REQ-${reqIndex.toString().padStart(3, '0')}`,
        description: line.replace(/^[-*\d.)]+\s*/, ''),
        type: isMandatory ? 'mandatory' : 'desirable',
        weight: isMandatory ? 2 : 1,
        source_text: line,
      })
    }
  }

  // If no requirements found from patterns, treat each substantial line as desirable
  if (requirements.length === 0) {
    for (const line of lines) {
      if (line.length > 30) {
        reqIndex += 1
        requirements.push({
          id: `REQ-${reqIndex.toString().padStart(3, '0')}`,
          description: line.replace(/^[-*\d.)]+\s*/, ''),
          type: 'desirable',
          weight: 1,
          source_text: line,
        })
      }
    }
  }

  return requirements
}

// ---------------------------------------------------------------------------
// Compliance checking
// ---------------------------------------------------------------------------

export async function checkCompliance(
  supabase: SupabaseClient,
  orgId: string,
  tenderId: string,
): Promise<{ items: ComplianceItem[]; overallScore: number }> {
  // Fetch tender with requirements
  const { data: tender, error: tenderError } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .eq('org_id', orgId)
    .single()

  if (tenderError || !tender) {
    throw new Error(tenderError?.message ?? `Tender ${tenderId} not found`)
  }

  const tenderData = tender as Tender
  const extracted = (tenderData.requirements?.extracted as RequirementItem[]) ?? []

  // If no extracted requirements, extract them first
  const requirements = extracted.length > 0
    ? extracted
    : await extractRequirements(supabase, orgId, tenderId)

  // Fetch capability profiles
  const { data: profiles } = await supabase
    .from('capability_profiles')
    .select('*')
    .eq('org_id', orgId)

  const caps = (profiles ?? []) as CapabilityProfile[]
  const allSkills = caps.flatMap((c) => c.skills).map((s) => s.toLowerCase())
  const allCerts = caps.flatMap((c) => c.certifications).map((c) => c.toLowerCase())
  const allProjectKeywords = caps
    .flatMap((c) => c.past_projects)
    .flatMap((p) => p.keywords ?? [])
    .map((k) => k.toLowerCase())

  const capText = [...allSkills, ...allCerts, ...allProjectKeywords].join(' ')

  const items: ComplianceItem[] = []
  let totalWeight = 0
  let scoredWeight = 0

  for (const req of requirements) {
    const reqLower = req.description.toLowerCase()
    const words = reqLower.split(/\s+/).filter((w) => w.length > 3)

    // Check how many words match capabilities
    const matchCount = words.filter((w) => capText.includes(w)).length
    const matchRatio = words.length > 0 ? matchCount / words.length : 0

    let status: ComplianceItem['status']
    let evidence: string

    if (matchRatio >= 0.4) {
      status = 'met'
      evidence = `Capability match: ${allSkills.filter((s) => reqLower.includes(s)).join(', ') || 'general match'}`
    } else if (matchRatio >= 0.15) {
      status = 'partially_met'
      evidence = 'Partial capability overlap detected. May need additional evidence or partner support.'
    } else {
      status = 'not_met'
      evidence = 'No matching capability found. Consider subcontracting or addressing in response.'
    }

    const weight = req.weight
    totalWeight += weight

    if (status === 'met') scoredWeight += weight
    else if (status === 'partially_met') scoredWeight += weight * 0.5

    items.push({
      requirement_id: req.id,
      requirement: req.description,
      status,
      evidence,
      notes: '',
    })
  }

  const overallScore = totalWeight > 0 ? Math.round((scoredWeight / totalWeight) * 100) : 0

  // Update tender_responses if exists
  await supabase
    .from('tender_responses')
    .upsert(
      {
        org_id: orgId,
        tender_id: tenderId,
        compliance_score: overallScore,
        content: {
          sections: [],
          requirements_checklist: requirements,
          compliance_matrix: items,
        },
        status: 'draft',
      },
      { onConflict: 'org_id,tender_id' },
    )

  return { items, overallScore }
}

// ---------------------------------------------------------------------------
// Tender response draft generation
// ---------------------------------------------------------------------------

export async function generateTenderResponse(
  supabase: SupabaseClient,
  orgId: string,
  tenderId: string,
): Promise<TenderResponse> {
  // Fetch tender
  const { data: tender, error: tenderError } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .eq('org_id', orgId)
    .single()

  if (tenderError || !tender) {
    throw new Error(tenderError?.message ?? `Tender ${tenderId} not found`)
  }

  const tenderData = tender as Tender

  // Fetch best capability profile
  const { data: profileData } = await supabase
    .from('capability_profiles')
    .select('*')
    .eq('org_id', orgId)
    .limit(1)
    .single()

  const profile = profileData as CapabilityProfile | null

  // Get or run compliance check
  const compliance = await checkCompliance(supabase, orgId, tenderId)

  // Build response sections (Opus would generate these in production)
  const sections = buildResponseSections(tenderData, profile, compliance.items)

  // Estimate effort
  const effortHours = estimateEffort(tenderData, compliance.overallScore)

  // Upsert response
  const content: TenderResponseContent = {
    sections,
    requirements_checklist: (tenderData.requirements?.extracted as RequirementItem[]) ?? [],
    compliance_matrix: compliance.items,
  }

  const { data: response, error: responseError } = await supabase
    .from('tender_responses')
    .upsert(
      {
        org_id: orgId,
        tender_id: tenderId,
        status: 'draft',
        content,
        compliance_score: compliance.overallScore,
        fit_score: tenderData.fit_score,
        estimated_effort_hours: effortHours,
      },
      { onConflict: 'org_id,tender_id' },
    )
    .select()
    .single()

  if (responseError || !response) {
    throw new Error(responseError?.message ?? 'Failed to save tender response')
  }

  return response as TenderResponse
}

function buildResponseSections(
  tender: Tender,
  profile: CapabilityProfile | null,
  complianceItems: ComplianceItem[],
): Array<{ title: string; content: string }> {
  const orgName = profile?.name ?? 'Our Organisation'
  const skills = profile?.skills ?? []
  const certs = profile?.certifications ?? []

  const metCount = complianceItems.filter((c) => c.status === 'met').length
  const totalCount = complianceItems.length

  return [
    {
      title: 'Executive Summary',
      content: `${orgName} is pleased to submit this response to "${tender.title}". We bring proven expertise in ${skills.slice(0, 4).join(', ') || 'the required service areas'} and demonstrate compliance with ${metCount} of ${totalCount} identified requirements. We are committed to delivering outcomes that exceed expectations${tender.deadline ? ` within the specified timeframe (closing: ${new Date(tender.deadline).toLocaleDateString('en-AU')})` : ''}.`,
    },
    {
      title: 'Capability Statement',
      content: `${orgName} is an Australian-registered business with demonstrated capability across ${skills.join(', ') || 'relevant service areas'}. Our certifications include: ${certs.join(', ') || 'details available upon request'}. We have successfully delivered ${profile?.past_projects?.length ?? 0} comparable engagements.`,
    },
    {
      title: 'Methodology',
      content: `Our proposed methodology follows a structured approach:\n\n**Phase 1 -- Discovery & Planning:** Stakeholder alignment, requirements confirmation, and project plan sign-off.\n\n**Phase 2 -- Delivery:** Core deliverables executed by our specialist team, with weekly progress updates and quality gates.\n\n**Phase 3 -- Quality Assurance:** Peer review, compliance verification, and client review cycles.\n\n**Phase 4 -- Handover:** Full knowledge transfer, documentation, and closure reporting.`,
    },
    {
      title: 'Team & Resources',
      content: `Our proposed team has expertise across: ${skills.join(', ') || '[key skills]'}.\n\nRelevant certifications: ${certs.join(', ') || '[certifications]'}.\n\nAll team members are available to commence within 2 weeks of contract award.`,
    },
    {
      title: 'Relevant Experience',
      content: profile?.past_projects?.length
        ? profile.past_projects
            .slice(0, 5)
            .map((p) => `- ${p.title}${p.value ? ` ($${p.value.toLocaleString()})` : ''}`)
            .join('\n')
        : '- [Insert relevant project references]',
    },
    {
      title: 'Pricing',
      content: tender.value
        ? `Our pricing is competitive and within the estimated range of $${tender.value.toLocaleString()}. A detailed cost breakdown is provided in the pricing schedule.`
        : 'Detailed pricing is provided in the attached Schedule of Rates. All prices include GST.',
    },
    {
      title: 'Compliance Matrix',
      content: complianceItems
        .map((c) => `- **${c.requirement}**: ${c.status.replace('_', ' ')} -- ${c.evidence}`)
        .join('\n') || 'Compliance assessment pending.',
    },
  ]
}

function estimateEffort(tender: Tender, complianceScore: number): number {
  // Base effort based on contract value
  const value = tender.value ?? 50000
  let hours: number

  if (value < 50000) hours = 20
  else if (value < 200000) hours = 40
  else if (value < 500000) hours = 80
  else hours = 120

  // Adjust for compliance gaps (lower compliance = more effort to address)
  if (complianceScore < 50) hours *= 1.5
  else if (complianceScore < 75) hours *= 1.2

  return Math.round(hours)
}

// ---------------------------------------------------------------------------
// Tender fit scoring (comprehensive)
// ---------------------------------------------------------------------------

export async function scoreTenderFit(
  supabase: SupabaseClient,
  orgId: string,
  tenderId: string,
): Promise<TenderFitScore> {
  const { data: tender, error } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .eq('org_id', orgId)
    .single()

  if (error || !tender) {
    throw new Error(error?.message ?? `Tender ${tenderId} not found`)
  }

  const tenderData = tender as Tender

  // Get compliance data
  const compliance = await checkCompliance(supabase, orgId, tenderId)

  // Get capability profiles
  const { data: profiles } = await supabase
    .from('capability_profiles')
    .select('*')
    .eq('org_id', orgId)

  const caps = (profiles ?? []) as CapabilityProfile[]

  // Calculate fit score components
  const complianceScore = compliance.overallScore

  // Effort vs value ratio
  const effortHours = estimateEffort(tenderData, complianceScore)
  const hourlyRate = 150 // Assumed hourly rate AUD
  const effortCost = effortHours * hourlyRate
  const contractValue = tenderData.value ?? 50000
  const effortVsValue = Math.min(100, Math.round((1 - effortCost / contractValue) * 100))

  // Win probability based on compliance and profile match
  let winProbability = complianceScore * 0.4
  if (caps.length > 0) {
    const bestMatch = caps.reduce((best, cap) => {
      const score = calculateProfileMatch(tenderData, cap)
      return score > best ? score : best
    }, 0)
    winProbability += bestMatch * 0.3
  }
  winProbability += effortVsValue * 0.3
  winProbability = Math.min(100, Math.round(winProbability))

  // Overall fit score
  const fitScore = Math.round(
    complianceScore * 0.35 +
    winProbability * 0.35 +
    effortVsValue * 0.3,
  )

  // Recommendation
  const recommendation: TenderFitScore['recommendation'] =
    fitScore >= 60 ? 'pursue' : fitScore >= 35 ? 'consider' : 'skip'

  // Matched keywords and gaps from compliance
  const matchedKeywords = compliance.items
    .filter((c) => c.status === 'met')
    .map((c) => c.requirement.slice(0, 50))
  const gaps = compliance.items
    .filter((c) => c.status === 'not_met')
    .map((c) => c.requirement.slice(0, 50))

  const reasoning =
    recommendation === 'pursue'
      ? `Strong fit (${fitScore}/100). Compliance at ${complianceScore}%, good effort-to-value ratio. Recommend pursuing.`
      : recommendation === 'consider'
        ? `Moderate fit (${fitScore}/100). ${gaps.length} gaps identified. Consider if resources allow or partner to fill gaps.`
        : `Low fit (${fitScore}/100). Significant gaps and poor effort-to-value ratio. Resources better allocated elsewhere.`

  // Persist score
  await supabase
    .from('tenders')
    .update({ fit_score: fitScore })
    .eq('id', tenderId)
    .eq('org_id', orgId)

  return {
    tenderId,
    fitScore,
    complianceScore,
    effortVsValue,
    winProbability,
    recommendation,
    reasoning,
    matchedKeywords,
    gaps,
  }
}

// ---------------------------------------------------------------------------
// Scheduler tick: daily tender scan
// ---------------------------------------------------------------------------

export async function runTenderHunterTick(
  supabase: SupabaseClient,
  orgId: string,
  _agentConfigId: string,
): Promise<TenderHunterTickResult> {
  const result: TenderHunterTickResult = { scanned: 0, newTenders: 0, evaluated: 0, errors: 0 }

  try {
    // Fetch org's capability profiles to derive search keywords
    const { data: profiles } = await supabase
      .from('capability_profiles')
      .select('*')
      .eq('org_id', orgId)

    const caps = (profiles ?? []) as CapabilityProfile[]

    // Derive keywords from skills and service categories
    const keywords = Array.from(
      new Set(
        caps.flatMap((c) => [
          ...c.skills,
          c.service_category,
          ...(c.past_projects?.flatMap((p) => p.keywords ?? []) ?? []),
        ]).filter(Boolean),
      ),
    )

    if (keywords.length === 0) {
      // No capability profiles configured -- nothing to scan
      return result
    }

    // Scrape all sources
    const { tenders: scraped, errors: scrapeErrors } = await scrapeAllSources(supabase, orgId, keywords)
    result.scanned = scraped.length
    result.errors += scrapeErrors.length

    // Upsert into DB
    const { inserted, errors: upsertErrors } = await upsertScrapedTenders(supabase, orgId, scraped)
    result.newTenders = inserted
    result.errors += upsertErrors

    // Auto-evaluate fit for new tenders
    const filtered = await filterTenders(supabase, orgId)
    result.evaluated = filtered.length
  } catch {
    result.errors += 1
  }

  return result
}

// ---------------------------------------------------------------------------
// Public API (convenience namespace)
// ---------------------------------------------------------------------------

export const tenderHunter = {
  search: searchTenders,
  filter: filterTenders,
  extractRequirements,
  checkCompliance,
  generateResponse: generateTenderResponse,
  scoreFit: scoreTenderFit,
  tick: runTenderHunterTick,
}
