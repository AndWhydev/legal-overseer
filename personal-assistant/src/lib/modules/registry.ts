/**
 * Module registry — defines which tabs/modules are available per plan tier,
 * with support for per-org overrides and industry pack resolution.
 */

import { getPack } from '@/lib/industry/registry'
import type { Mode } from '@/lib/dashboard/mode-store'

// ─── ModuleConfig — per-module metadata (mode + layout) ──────────────────────

export type SidebarVariant =
  | 'chat-history'
  | 'inbox-list'
  | 'work-views'
  | 'money-filters'
  | 'default';

export interface ModuleConfig {
  /** Which dashboard mode this module belongs to (default: 'work') */
  mode?: Mode;
  /** Preferred max-width for the main canvas (default: '1400px') */
  maxWidth?: string;
  /** Which sidebar variant to render when this module is active */
  sidebarVariant?: SidebarVariant;
}

/**
 * Per-module mode metadata for all 34 tabs.
 * Keys match tab IDs in spa-shell.tsx TABS array.
 *
 * Mapping rationale (from .planning/dashboard-mode-refactor.md §4):
 * - chat mode:  chat page
 * - inbox mode: inbox, approvals, channels (messaging surfaces)
 * - work mode:  tasks, leads, contacts, companies, meetings, tenders, workflows,
 *               jobs, quotes, swarm, sentry, ai-search, ad-scripts, creator-studio,
 *               knowledge, analytics, activity, monitoring, admin, beta-admin,
 *               dashboard, command-center (operational pages)
 * - money mode: invoices, costs, reports, billing settings
 * - settings:   neutral (keep legacy default sidebar, mode-neutral)
 */
export const MODULE_CONFIG: Record<string, ModuleConfig> = {
  // ── Chat mode ──────────────────────────────────────────────────────────────
  chat: {
    mode: 'chat',
    maxWidth: '720px',
    sidebarVariant: 'chat-history',
  },

  // ── Inbox mode ─────────────────────────────────────────────────────────────
  inbox: {
    mode: 'inbox',
    maxWidth: '1040px',
    sidebarVariant: 'inbox-list',
  },
  approvals: {
    mode: 'inbox',
    maxWidth: '1040px',
    sidebarVariant: 'inbox-list',
  },
  channels: {
    mode: 'inbox',
    maxWidth: '1040px',
    sidebarVariant: 'inbox-list',
  },

  // ── Work mode ──────────────────────────────────────────────────────────────
  dashboard: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  'command-center': {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  tasks: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  leads: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  contacts: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  companies: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  meetings: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  tenders: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  workflows: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  jobs: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  quotes: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  'creator-studio': {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  'ad-scripts': {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  'ai-search': {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  knowledge: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  swarm: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  sentry: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  analytics: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  activity: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  admin: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  monitoring: {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },
  'beta-admin': {
    mode: 'work',
    maxWidth: '1800px',
    sidebarVariant: 'work-views',
  },

  // ── Money mode ─────────────────────────────────────────────────────────────
  invoices: {
    mode: 'money',
    maxWidth: '1600px',
    sidebarVariant: 'money-filters',
  },
  costs: {
    mode: 'money',
    maxWidth: '1600px',
    sidebarVariant: 'money-filters',
  },
  reports: {
    mode: 'money',
    maxWidth: '1600px',
    sidebarVariant: 'money-filters',
  },
  'settings-billing': {
    mode: 'money',
    maxWidth: '1600px',
    sidebarVariant: 'money-filters',
  },

  // ── Settings (mode-neutral) ────────────────────────────────────────────────
  'settings-connections': {
    mode: 'work',
    maxWidth: '1400px',
    sidebarVariant: 'default',
  },
  'settings-automations': {
    mode: 'work',
    maxWidth: '1400px',
    sidebarVariant: 'default',
  },
  'settings-appearance': {
    mode: 'work',
    maxWidth: '1400px',
    sidebarVariant: 'default',
  },
};

/**
 * Get the mode metadata for a given tab ID.
 * Falls back to sensible defaults for any tab not explicitly mapped.
 */
export function getModuleConfig(tabId: string): Required<ModuleConfig> {
  const config = MODULE_CONFIG[tabId] ?? {};
  return {
    mode: config.mode ?? 'work',
    maxWidth: config.maxWidth ?? '1400px',
    sidebarVariant: config.sidebarVariant ?? 'default',
  };
}

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
