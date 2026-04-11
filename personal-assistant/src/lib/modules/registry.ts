/**
 * Module registry — defines which tabs/modules are available per plan tier,
 * with support for per-org overrides and industry pack resolution.
 */

import { getPack } from '@/lib/industry/registry'

// Every org gets these regardless of plan
const CORE_MODULES = [
  'command-center',
  'dashboard',
  'chat',
  'inbox',
  'settings-connections',
  'settings-automations',
  'settings-appearance',
  'settings-billing',
] as const;

// All possible module IDs (matches tab IDs in spa-shell.tsx)
export const ALL_MODULES = [
  ...CORE_MODULES,
  'creator-studio',
  'companies',
  'contacts',
  'leads',
  'invoices',
  'tenders',
  'approvals',
  'meetings',
  'ad-scripts',
  'ai-search',
  'reports',
  'knowledge',
  'costs',
  'analytics',
  'activity',
  'admin',
  'monitoring',
  'beta-admin',
  'sentry',
  'swarm',
  'workflows',
  'tasks',
] as const;

export type ModuleId = (typeof ALL_MODULES)[number];

// Tier defaults (additive on top of core)
const TIER_MODULES: Record<string, readonly string[] | 'all'> = {
  beta: [
    ...CORE_MODULES,
    'companies',
    'contacts',
    'leads',
    'invoices',
    'tenders',
    'approvals',
    'connections',
    'meetings',
    'ad-scripts',
    'ai-search',
    'workflows',
  ],
  starter: [
    ...CORE_MODULES,
    'contacts',
    'approvals',
  ],
  growth: [
    ...CORE_MODULES,
    'companies',
    'contacts',
    'leads',
    'invoices',
    'tenders',
    'approvals',
    'connections',
    'meetings',
    'ad-scripts',
    'ai-search',
    'workflows',
  ],
  scale: [
    ...CORE_MODULES,
    'companies',
    'contacts',
    'leads',
    'invoices',
    'tenders',
    'approvals',
    'connections',
    'meetings',
    'ad-scripts',
    'ai-search',
    'reports',
    'knowledge',
    'costs',
    'analytics',
    'activity',
    'admin',
    'monitoring',
    'beta-admin',
    'sentry',
    'swarm',
    'workflows',
  ],
  enterprise: 'all',
};

/**
 * Compute the enabled modules for an org.
 * @param plan - The org's plan tier (starter, growth, scale, enterprise)
 * @param orgOverrides - Per-org override list from `organisations.enabled_modules`. NULL = use tier defaults.
 */
export function getEnabledModules(
  plan: string,
  orgOverrides: string[] | null,
  industry?: string,
): string[] {
  // If org has explicit overrides, use those (always include core)
  if (orgOverrides && orgOverrides.length > 0) {
    const set = new Set([...CORE_MODULES, ...orgOverrides]);
    return ALL_MODULES.filter(m => set.has(m));
  }

  // Resolve tier modules from industry pack if provided
  if (industry) {
    const pack = getPack(industry);
    const packTier = pack.tierModules[plan];
    if (packTier === 'all') {
      return [...CORE_MODULES, ...pack.modules];
    }
    if (packTier) {
      const set = new Set([...CORE_MODULES, ...packTier]);
      return ALL_MODULES.filter(m => set.has(m));
    }
  }

  // Fallback to hardcoded tier defaults
  const tierDef = TIER_MODULES[plan] ?? TIER_MODULES.starter;
  if (tierDef === 'all') {
    return [...ALL_MODULES];
  }
  return [...tierDef];
}

/**
 * Check if a specific module is enabled for the given configuration.
 */
export function isModuleEnabled(
  moduleId: string,
  plan: string,
  orgOverrides: string[] | null,
  industry?: string,
): boolean {
  return getEnabledModules(plan, orgOverrides, industry).includes(moduleId);
}

// ─── Sidebar Category Mapping ─────────────────────────────────────────────────

export interface SidebarCategory {
  id: string;
  label: string;
  icon: string;       // lucide icon name used in sidebar-rail
  items: string[];    // tab IDs
  directNav?: string; // if set, clicking category navigates directly (no panel)
}

export const SIDEBAR_CATEGORIES: SidebarCategory[] = [
  { id: 'home',         label: 'Home',         icon: 'LayoutDashboard', items: ['dashboard', 'command-center'], directNav: 'dashboard' },
  { id: 'messages',     label: 'Messages',     icon: 'MessageSquare',   items: ['chat', 'inbox', 'creator-studio', 'tasks'] },
  { id: 'business',     label: 'Business',     icon: 'Briefcase',       items: ['companies', 'leads', 'invoices', 'tenders', 'contacts', 'approvals'] },
  { id: 'intelligence', label: 'Intelligence', icon: 'Brain',           items: ['meetings', 'swarm', 'workflows', 'sentry', 'ad-scripts', 'ai-search', 'reports', 'knowledge', 'analytics'] },
  { id: 'operations',   label: 'Operations',   icon: 'Wrench',          items: ['activity', 'costs', 'admin', 'monitoring', 'beta-admin'] },
  { id: 'settings',      label: 'Settings',     icon: 'Settings',        items: ['settings-connections', 'settings-automations', 'settings-appearance', 'settings-billing'] },
];

/** Map a tab ID to its parent category ID */
export function getCategoryForTab(tabId: string): string | undefined {
  return SIDEBAR_CATEGORIES.find(c => c.items.includes(tabId))?.id;
}

// ─── UI Composition Profiles ─────────────────────────────────────────────────

export interface UIComposition {
  profileId: string;
  visibleModules: string[];
  primaryModules: string[];
  advancedModules: string[];
  categories: SidebarCategory[];
  defaultTab: string;
  sidebarStyle: 'compact' | 'full';
  tourVariant: 'essential' | 'full';
  labelOverrides: Record<string, string>;
}

export const ESSENTIAL_COMPOSITION: UIComposition = {
  profileId: 'essential',
  visibleModules: ['command-center', 'inbox', 'approvals', 'contacts', 'settings-connections', 'settings-automations', 'settings-appearance', 'chat', 'leads', 'invoices', 'channels', 'tasks'],
  primaryModules: ['command-center', 'inbox', 'approvals', 'contacts', 'tasks'],
  advancedModules: ['chat', 'leads', 'invoices', 'channels'],
  categories: [
    SIDEBAR_CATEGORIES[0], // Home
    SIDEBAR_CATEGORIES[1], // Messages
    SIDEBAR_CATEGORIES[2], // Business
  ],
  defaultTab: 'dashboard',
  sidebarStyle: 'compact',
  tourVariant: 'essential',
  labelOverrides: { 'command-center': 'Home' },
};

export const FULL_COMPOSITION: UIComposition = {
  profileId: 'full',
  visibleModules: [...ALL_MODULES],
  primaryModules: ['command-center', 'dashboard', 'chat', 'inbox', 'leads', 'invoices', 'tenders', 'contacts', 'approvals'],
  advancedModules: ['creator-studio', 'meetings', 'sentry', 'costs', 'activity', 'admin', 'monitoring', 'knowledge', 'analytics', 'ad-scripts', 'ai-search', 'reports'],
  categories: SIDEBAR_CATEGORIES.filter(c => c.id !== 'settings'),
  defaultTab: 'dashboard',
  sidebarStyle: 'full',
  tourVariant: 'full',
  labelOverrides: {},
};

/**
 * Resolve the UI composition for a given profile string.
 */
export function getComposition(uiProfile: string, industry?: string): UIComposition {
  const base = uiProfile === 'essential' ? ESSENTIAL_COMPOSITION : FULL_COMPOSITION;

  if (industry) {
    const pack = getPack(industry);
    const packComp = uiProfile === 'essential' ? pack.compositions.essential : pack.compositions.full;
    return {
      ...base,
      ...packComp,
      labelOverrides: { ...base.labelOverrides, ...pack.labelOverrides },
    };
  }

  return base;
}
