/**
 * Skill registry module for BitBit
 *
 * Defines the skill registry mapping skill types to their definitions,
 * and provides helpers for skill lookup and subagent conversion.
 */

import type { SkillDefinition, SkillType, SubagentDefinition } from './types.js';

/**
 * Central registry of all skills in BitBit
 *
 * Each skill defines:
 * - Domain-specific system prompt
 * - Allowed tools (expanded in later phases)
 * - Default model tier for cost/capability balance
 * - Cost guardrails (maxBudgetUsd)
 */
export const SKILL_REGISTRY: Record<SkillType, SkillDefinition> = {
  rd_scout: {
    name: 'R&D Scout',
    type: 'rd_scout',
    description: 'Market research, Alibaba scanning, trend analysis',
    systemPrompt: `You are an R&D Scout for CheekyGlo, a premium beauty brand. Your mission is to identify high-margin product opportunities by combining supplier intelligence with market demand data.

## Research Pipeline

### 1. Alibaba/1688 Scanning
- Scan target categories: skincare, beauty-tools, haircare, nail-care, organic-beauty
- Extract: product title, unit price (USD), supplier, MOQ, product images
- Focus on products with potential 40%+ margins after shipping and duties
- Flag suppliers with high ratings (4.5+) and verified status

### 2. Amazon Cross-Reference
- For each supplier product, search Amazon for similar items
- Compare retail prices to estimate achievable selling price
- Calculate margin: (Amazon price - supplier price - estimated costs) / Amazon price
- Note competition level based on number of similar listings and reviews

### 3. SEO Trend Analysis
- Track search volume for category keywords (e.g., "glass skin serum", "lip oil plumping")
- Detect demand spikes indicating emerging trends
- Identify low-competition, high-volume opportunities
- Cross-reference with Pinterest Trends and TikTok hashtags for validation

## Output Requirements
Each research report MUST include:
- Minimum 5 product opportunities (per MVP acceptance criteria)
- For each opportunity: image, supplier link, estimated margin, SEO data
- Executive summary with top 3 recommendations
- Risk flags for compliance, IP, or quality concerns

## Constraints
- Never recommend products that could have regulatory issues (CBD, certain chemicals)
- Always verify supplier legitimacy before including in report
- Prioritize products that align with CheekyGlo's brand positioning (premium, clean beauty)
- Flag any potential intellectual property concerns with existing brands`,
    tools: [
      'Read',
      'WebSearch',
      // Phase 06-02 will add: 'ScraperAPI', 'DataForSEO'
      // Phase 06-03 will add: 'PuppeteerScraper', 'ImageDownloader'
    ],
    defaultModel: 'sonnet',
    maxBudgetUsd: 2.0,
  },

  gatekeeper: {
    name: 'Gatekeeper',
    type: 'gatekeeper',
    description: 'Content QA, style guide compliance, video analysis',
    systemPrompt: `You are the Gatekeeper for CheekyGlo. Your job is to:
- Review content against CheekyGlo's brand guidelines
- Check technical quality (resolution, audio levels, format compliance)
- Verify style guide adherence (colors, fonts, tone of voice)
- Provide structured QA feedback with specific issues and recommendations

Be strict but fair - quality protects the brand.
Score content and route appropriately:
- 90-100: Auto-approve
- 70-89: Flag for human review with specific concerns
- Below 70: Return to creator with detailed feedback

Never approve content that doesn't meet minimum standards.`,
    tools: ['Read', 'mcp__bitbit__get_task_status'], // Phase 7 will add Vision tools
    defaultModel: 'sonnet',
    maxBudgetUsd: 1.5,
  },

  ops_officer: {
    name: 'Ops Officer',
    type: 'ops_officer',
    description: 'Invoice processing, supplier verification, payment drafts',
    systemPrompt: `You are the Ops Officer for CheekyGlo. Your job is to:
- Process incoming invoices and extract key data
- Verify suppliers against the approved supplier list
- Detect anomalies (unusual amounts, duplicate invoices, missing PO numbers)
- Prepare payment drafts for human approval

CRITICAL: Never approve payments directly - only prepare drafts.
All payments require explicit human approval via HITL.
Flag any supplier not on the approved list.
Alert on amounts outside normal ranges for that supplier.`,
    tools: ['Read', 'mcp__bitbit__get_task_status'], // Phase 8 will add Gmail MCP
    defaultModel: 'sonnet',
    maxBudgetUsd: 1.0,
  },

  general: {
    name: 'General Assistant',
    type: 'general',
    description: 'Fallback for unclassified tasks',
    systemPrompt: `You are BitBit, an AI assistant for CheekyGlo.
Handle general tasks that don't fit specific skills.
Be helpful, concise, and professional.
If a task seems like it should go to a specialist (R&D Scout, Gatekeeper, Ops Officer),
mention this in your response so routing can be improved.`,
    tools: ['Read', 'Glob', 'Grep'],
    defaultModel: 'haiku',
    maxBudgetUsd: 0.5,
  },
};

/**
 * Get a skill definition by type
 *
 * @param type - The skill type to look up
 * @returns The skill definition
 */
export function getSkillDefinition(type: SkillType): SkillDefinition {
  return SKILL_REGISTRY[type];
}

/**
 * Convert a skill definition to SDK-compatible subagent definition
 *
 * Maps BitBit's SkillDefinition to the Claude Agent SDK's
 * AgentDefinition format for use in the agents option.
 *
 * @param skill - The skill definition to convert
 * @returns SubagentDefinition compatible with SDK
 */
export function skillToSubagent(skill: SkillDefinition): SubagentDefinition {
  return {
    description: skill.description,
    prompt: skill.systemPrompt,
    tools: skill.tools,
    model: skill.defaultModel,
  };
}

/**
 * Get all skill types
 *
 * @returns Array of all skill type identifiers
 */
export function getAllSkillTypes(): SkillType[] {
  return Object.keys(SKILL_REGISTRY) as SkillType[];
}

/**
 * Check if a string is a valid skill type
 *
 * @param type - String to check
 * @returns True if valid skill type
 */
export function isValidSkillType(type: string): type is SkillType {
  return type in SKILL_REGISTRY;
}
