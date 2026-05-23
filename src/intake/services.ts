/**
 * The 20 services BitBit offers. The scope parser must map every
 * incoming scope doc to exactly one of these slugs.
 *
 * Order is significant: it matches the canonical list the operator
 * maintains; never reorder, only append.
 */

export const SERVICE_TYPES = [
  'custom_app',
  'react_nextjs',
  'flutter',
  'api_development',
  'custom_saas',
  'legacy_modernisation',
  'llm_integration',
  'rag_knowledge_base',
  'ai_chatbot',
  'data_analytics',
  'workflow_automation',
  'cloud_devops',
  'cybersecurity',
  'database_architecture',
  'smart_contracts',
  'defi_platform',
  'nft_marketplace',
  'qa_testing',
  'deployment',
  'seo_backlinks',
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

/**
 * Human-readable label per service slug. Used in the parser prompt and
 * in confirmation emails so the operator sees the friendly name.
 */
export const SERVICE_LABELS: Record<ServiceType, string> = {
  custom_app: 'Custom App',
  react_nextjs: 'React / Next.js',
  flutter: 'Flutter',
  api_development: 'API Development',
  custom_saas: 'Custom SaaS',
  legacy_modernisation: 'Legacy Modernisation',
  llm_integration: 'LLM Integration',
  rag_knowledge_base: 'RAG Knowledge Base',
  ai_chatbot: 'AI Chatbot',
  data_analytics: 'Data Analytics',
  workflow_automation: 'Workflow Automation',
  cloud_devops: 'Cloud / DevOps',
  cybersecurity: 'Cybersecurity',
  database_architecture: 'Database Architecture',
  smart_contracts: 'Smart Contracts',
  defi_platform: 'DeFi Platform',
  nft_marketplace: 'NFT Marketplace',
  qa_testing: 'QA Testing',
  deployment: 'Deployment',
  seo_backlinks: 'SEO / Backlinks',
};

export function isServiceType(s: string): s is ServiceType {
  return (SERVICE_TYPES as readonly string[]).includes(s);
}

export function serviceLabel(s: ServiceType): string {
  return SERVICE_LABELS[s];
}

/**
 * Block of text the parser sees so it knows the legal slug set. Kept
 * in this module so the list never drifts out of sync with the constants.
 */
export function servicesPromptBlock(): string {
  return SERVICE_TYPES.map((slug) => `  - ${slug}  (${SERVICE_LABELS[slug]})`).join('\n');
}
