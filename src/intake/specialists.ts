/**
 * Specialist agent roster.
 *
 * The scope parser picks a subset of these for each new project so the
 * overseer knows which roles will be needed downstream (worker prompts,
 * playbook framing, future agent dispatch).
 *
 * Each specialist has a short description so the parser can choose
 * sensibly from the document content alone.
 */

export const SPECIALIST_AGENTS = [
  'frontend_engineer',
  'backend_engineer',
  'fullstack_engineer',
  'mobile_engineer',
  'devops_engineer',
  'security_engineer',
  'ai_engineer',
  'ml_engineer',
  'data_engineer',
  'blockchain_engineer',
  'database_engineer',
  'qa_engineer',
  'seo_specialist',
  'product_designer',
  'technical_writer',
] as const;

export type SpecialistAgent = (typeof SPECIALIST_AGENTS)[number];

export const SPECIALIST_DESCRIPTIONS: Record<SpecialistAgent, string> = {
  frontend_engineer: 'React/Next.js/Vue UI work, design systems, accessibility',
  backend_engineer: 'API design, server logic, business rules, integrations',
  fullstack_engineer: 'End-to-end features across frontend + backend',
  mobile_engineer: 'iOS/Android native, Flutter, React Native',
  devops_engineer: 'CI/CD, infra-as-code, container orchestration, observability',
  security_engineer: 'Threat modelling, pen testing, hardening, auth/identity',
  ai_engineer: 'LLM apps, prompt engineering, agentic systems, retrieval pipelines',
  ml_engineer: 'Training pipelines, model tuning, evaluation, MLOps',
  data_engineer: 'ETL pipelines, warehousing, streaming, analytics infra',
  blockchain_engineer: 'Smart contracts (Solidity/Move/Rust), on-chain dApps, audits',
  database_engineer: 'Schema design, migrations, query optimisation, sharding',
  qa_engineer: 'Test strategy, e2e/unit/integration tests, regression coverage',
  seo_specialist: 'On-page SEO, link building, content strategy, schema markup',
  product_designer: 'IA, wireframes, UX flows, design system curation',
  technical_writer: 'Docs, API references, runbooks, onboarding guides',
};

export function isSpecialistAgent(s: string): s is SpecialistAgent {
  return (SPECIALIST_AGENTS as readonly string[]).includes(s);
}

export function specialistsPromptBlock(): string {
  return SPECIALIST_AGENTS.map(
    (slug) => `  - ${slug}  (${SPECIALIST_DESCRIPTIONS[slug]})`,
  ).join('\n');
}
