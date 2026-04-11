/**
 * Command Registry — Central registry of all dashboard actions for the Summon palette.
 *
 * Each command has metadata about which pages it's relevant on, what category it
 * belongs to, keywords for fuzzy search, and a handler to execute.
 */

import type { TablerIcon } from '@tabler/icons-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandCategory = 'navigation' | 'action' | 'create' | 'ai' | 'settings';

export interface SummonCommand {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Short description shown below label */
  description?: string;
  /** Category for grouping */
  category: CommandCategory;
  /** Icon component from @tabler/icons-react */
  icon?: TablerIcon;
  /** Which tab IDs this command is relevant on. Empty = global. */
  pages: string[];
  /** Extra keywords for fuzzy search (beyond label) */
  keywords: string[];
  /** Keyboard shortcut hint (display only) */
  shortcut?: string;
  /** Priority within category (lower = higher) */
  priority: number;
  /** Handler — receives navigateTo for tab switching */
  handler: (ctx: CommandContext) => void;
}

export interface CommandContext {
  /** Navigate to a tab by ID */
  navigateTo: (tabId: string) => void;
  /** Current active tab ID */
  activeTab: string;
  /** Dispatch a custom event */
  dispatch: (event: string, detail?: unknown) => void;
  /** Open chat with a pre-filled message */
  openChat: (message?: string) => void;
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

export const CATEGORY_META: Record<CommandCategory, { label: string; order: number }> = {
  action:     { label: 'Actions',    order: 0 },
  create:     { label: 'Create',     order: 1 },
  navigation: { label: 'Go to',      order: 2 },
  ai:         { label: 'Ask BitBit', order: 3 },
  settings:   { label: 'Settings',   order: 4 },
};

// ---------------------------------------------------------------------------
// Registry singleton
// ---------------------------------------------------------------------------

const commands: SummonCommand[] = [];

export function registerCommand(cmd: SummonCommand) {
  // Prevent duplicates
  if (!commands.find((c) => c.id === cmd.id)) {
    commands.push(cmd);
  }
}

export function registerCommands(cmds: SummonCommand[]) {
  cmds.forEach(registerCommand);
}

export function getAllCommands(): SummonCommand[] {
  return commands;
}

/**
 * Get commands relevant to the current page context.
 * Returns page-specific commands first, then global commands.
 */
export function getContextualCommands(activeTab: string): SummonCommand[] {
  const pageCommands: SummonCommand[] = [];
  const globalCommands: SummonCommand[] = [];

  for (const cmd of commands) {
    if (cmd.pages.length === 0) {
      globalCommands.push(cmd);
    } else if (cmd.pages.includes(activeTab)) {
      pageCommands.push(cmd);
    }
  }

  // Sort each group by category order, then priority
  const sort = (a: SummonCommand, b: SummonCommand) => {
    const catDiff = CATEGORY_META[a.category].order - CATEGORY_META[b.category].order;
    if (catDiff !== 0) return catDiff;
    return a.priority - b.priority;
  };

  return [...pageCommands.sort(sort), ...globalCommands.sort(sort)];
}

/**
 * Search commands by query string (simple fuzzy match on label + keywords).
 */
export function searchCommands(query: string, activeTab: string): SummonCommand[] {
  const q = query.toLowerCase().trim();
  if (!q) return getContextualCommands(activeTab);

  const scored: { cmd: SummonCommand; score: number }[] = [];

  for (const cmd of commands) {
    let score = 0;
    const label = cmd.label.toLowerCase();
    const desc = (cmd.description ?? '').toLowerCase();

    // Exact label match
    if (label === q) {
      score = 100;
    } else if (label.startsWith(q)) {
      score = 80;
    } else if (label.includes(q)) {
      score = 60;
    }

    // Description match
    if (desc.includes(q)) {
      score = Math.max(score, 40);
    }

    // Keyword match
    for (const kw of cmd.keywords) {
      if (kw.toLowerCase().includes(q)) {
        score = Math.max(score, 50);
        break;
      }
    }

    // Boost page-relevant commands
    if (cmd.pages.length === 0 || cmd.pages.includes(activeTab)) {
      score += 10;
    }

    if (score > 0) {
      scored.push({ cmd, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.cmd);
}
