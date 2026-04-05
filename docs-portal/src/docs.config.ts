export interface NavSection {
  title: string
  visibility?: 'public' | 'internal'  // default: 'internal'
  items: { title: string; href: string }[]
}

export const navigation: NavSection[] = [
  {
    title: 'Connections',
    visibility: 'public',
    items: [
      { title: 'Overview', href: '/docs/connections/overview' },
      { title: 'Quickstart', href: '/docs/connections/quickstart' },
      { title: 'Bridge Transport', href: '/docs/connections/bridge' },
      { title: 'Webhook Transport', href: '/docs/connections/webhook' },
      { title: 'Templates', href: '/docs/connections/templates' },
      { title: 'API Reference', href: '/docs/connections/api-reference' },
    ],
  },
  {
    title: 'Getting Started',
    items: [
      { title: 'Overview', href: '/docs/overview' },
      { title: 'Architecture', href: '/docs/getting-started/architecture' },
      { title: 'Quick Start', href: '/docs/getting-started/quick-start' },
    ],
  },
  {
    title: 'Intelligence Engine',
    items: [
      { title: 'TAOR Loop', href: '/docs/intelligence/taor-loop' },
      { title: 'Context Assembly', href: '/docs/intelligence/context-assembly' },
      { title: 'Proactive Recall', href: '/docs/intelligence/proactive-recall' },
      { title: 'Confidence Routing', href: '/docs/intelligence/confidence-routing' },
    ],
  },
  {
    title: 'Knowledge Graph',
    items: [
      { title: 'Entity Model', href: '/docs/knowledge-graph/entity-model' },
      { title: 'Graph Queries', href: '/docs/knowledge-graph/graph-queries' },
      { title: 'Entity Extraction', href: '/docs/knowledge-graph/entity-extraction' },
    ],
  },
  {
    title: 'Memory System',
    items: [
      { title: 'Memory Palace', href: '/docs/memory/memory-palace' },
      { title: 'Contextual Retrieval', href: '/docs/memory/contextual-retrieval' },
      { title: 'Sleep Consolidation', href: '/docs/memory/sleep-consolidation' },
      { title: 'Procedural Memory', href: '/docs/memory/procedural-memory' },
    ],
  },
  {
    title: 'Autonomy',
    items: [
      { title: 'Autonomy Levels', href: '/docs/autonomy/levels' },
      { title: 'Calibrator', href: '/docs/autonomy/calibrator' },
      { title: 'Proactive Intelligence', href: '/docs/autonomy/proactive-intelligence' },
      { title: 'Project Lifecycle', href: '/docs/autonomy/project-lifecycle' },
    ],
  },
  {
    title: 'Tools Reference',
    items: [
      { title: 'Core Tools', href: '/docs/tools/core-tools' },
      { title: 'Channel Tools', href: '/docs/tools/channel-tools' },
      { title: 'Agent Tools', href: '/docs/tools/agent-tools' },
    ],
  },
  {
    title: 'API Reference',
    items: [
      { title: 'Chat API', href: '/docs/api/chat-api' },
      { title: 'Dashboard APIs', href: '/docs/api/dashboard-apis' },
      { title: 'Cron Endpoints', href: '/docs/api/cron-endpoints' },
    ],
  },
  {
    title: 'Decisions',
    items: [
      { title: 'ADR-0001: pgvector', href: '/docs/decisions/0001-pgvector' },
      { title: 'ADR-0002: Dual Embeddings', href: '/docs/decisions/0002-dual-embeddings' },
      { title: 'ADR-0003: Memory OS', href: '/docs/decisions/0003-memory-os' },
      { title: 'ADR-0004: Graduation', href: '/docs/decisions/0004-graduation' },
    ],
  },
]
