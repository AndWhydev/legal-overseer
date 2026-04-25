'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  IconSparkles,
  IconMessageCircle,
  IconInbox,
  IconBriefcase,
  IconCurrencyDollar,
} from '@tabler/icons-react';
import {
  registerCommands,
  searchCommands,
  getContextualCommands,
  CATEGORY_META,
  type SummonCommand,
  type CommandContext,
  type CommandCategory,
} from '@/lib/command-registry';
import { BUILT_IN_COMMANDS } from '@/lib/commands/built-in-commands';
import type { Mode } from '@/lib/dashboard/mode-store';
import { useModeStoreOptional } from '@/lib/dashboard/mode-store';
import { isDashboardModesEnabled } from '@/lib/dashboard/feature-flag';

// ---------------------------------------------------------------------------
// Register built-in commands on module load
// ---------------------------------------------------------------------------

registerCommands(BUILT_IN_COMMANDS);

const MODES_ENABLED = isDashboardModesEnabled();

// ---------------------------------------------------------------------------
// Mode metadata
// ---------------------------------------------------------------------------

const MODE_META: Record<Mode, { label: string; icon: React.ElementType; shortcut: string; defaultTab: string }> = {
  chat:  { label: 'Chat',  icon: IconMessageCircle,   shortcut: '⌘1', defaultTab: 'chat'     },
  inbox: { label: 'Inbox', icon: IconInbox,            shortcut: '⌘2', defaultTab: 'inbox'    },
  work:  { label: 'Work',  icon: IconBriefcase,        shortcut: '⌘3', defaultTab: 'tasks'    },
  money: { label: 'Money', icon: IconCurrencyDollar,   shortcut: '⌘4', defaultTab: 'invoices' },
};

const ALL_MODES: Mode[] = ['chat', 'inbox', 'work', 'money'];

// ---------------------------------------------------------------------------
// Recent commands persistence
// ---------------------------------------------------------------------------

const RECENT_KEY = 'bitbit-summon-recent';
const MAX_RECENT = 5;

function getRecentCommands(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecentCommand(id: string) {
  const recent = getRecentCommands().filter((s) => s !== id);
  recent.unshift(id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SummonProps {
  /** Callback to navigate to a tab by ID */
  onNavigate: (tabId: string) => void;
  /** Current active tab ID */
  activeTab: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Summon({ onNavigate, activeTab }: SummonProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  // globalScope: when true, Tab was pressed and results broaden to all modes
  const [globalScope, setGlobalScope] = useState(false);
  const registeredRef = useRef(false);

  // Mode store — null when ModeProvider not mounted (flag off)
  const modeStore = useModeStoreOptional();
  const activeMode: Mode | undefined = MODES_ENABLED ? modeStore?.state.active : undefined;

  // Ensure commands are registered
  if (!registeredRef.current) {
    registerCommands(BUILT_IN_COMMANDS);
    registeredRef.current = true;
  }

  // Ctrl+K / Cmd+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for programmatic open (from / hotkey)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('bb-search-open', handler);
    return () => window.removeEventListener('bb-search-open', handler);
  }, []);

  // Reset scope and query when palette closes or opens
  useEffect(() => {
    if (open) {
      setRecentIds(getRecentCommands());
      setQuery('');
      setGlobalScope(false);
    }
  }, [open]);

  // Tab key broadens scope to global
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && activeMode && !globalScope) {
      e.preventDefault();
      setGlobalScope(true);
    }
  }, [activeMode, globalScope]);

  // Build command context
  const ctx: CommandContext = {
    navigateTo: onNavigate,
    activeTab,
    dispatch: (event, detail) => {
      window.dispatchEvent(new CustomEvent(event, { detail }));
    },
    openChat: (message?: string) => {
      onNavigate('chat');
      if (message) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('bb-chat-prefill', { detail: { message } }));
        }, 300);
      }
    },
  };

  const executeCommand = useCallback(
    (cmd: SummonCommand) => {
      saveRecentCommand(cmd.id);
      setOpen(false);
      cmd.handler(ctx);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx],
  );

  // Execute a mode switch
  const executeModeSwitch = useCallback((mode: Mode) => {
    if (!modeStore) return;
    setOpen(false);
    modeStore.switchMode(mode);
    const meta = MODE_META[mode];
    onNavigate(meta.defaultTab);
  }, [modeStore, onNavigate]);

  // Get commands — scoped to current mode if active, otherwise global
  const rawCommands = query.trim()
    ? searchCommands(query, activeTab)
    : getContextualCommands(activeTab);

  // Group commands by category
  const grouped = new Map<CommandCategory, SummonCommand[]>();
  for (const cmd of rawCommands) {
    const list = grouped.get(cmd.category) ?? [];
    list.push(cmd);
    grouped.set(cmd.category, list);
  }

  // Get recent commands for the "Recent" section (only when no query)
  const recentCommands = !query.trim()
    ? recentIds
        .map((id) => rawCommands.find((c) => c.id === id))
        .filter(Boolean) as SummonCommand[]
    : [];

  // Sort categories by their defined order
  const sortedCategories = [...grouped.entries()].sort(
    ([a], [b]) => CATEGORY_META[a].order - CATEGORY_META[b].order,
  );

  // "Switch to X" commands: all modes except current
  const switchToModes = MODES_ENABLED && activeMode
    ? ALL_MODES.filter((m) => m !== activeMode)
    : [];

  // Scope label (shown at top of palette when in a specific mode)
  const showScopeLabel = MODES_ENABLED && activeMode && !globalScope;
  const scopeLabel = activeMode ? `in ${activeMode}` : '';

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Summon"
      description={
        activeMode && !globalScope
          ? `${activeMode} — Ctrl+K to search · Tab to broaden`
          : `${activeTab} — Ctrl+K to search commands`
      }
    >
      {/* Scope indicator — subtle muted text, not a badge */}
      {showScopeLabel && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <span className="text-xs text-muted-foreground">{scopeLabel}</span>
          <span className="ml-auto text-xs text-muted-foreground/50">Tab to broaden</span>
        </div>
      )}
      {globalScope && activeMode && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <span className="text-xs text-muted-foreground">all modes</span>
        </div>
      )}

      <CommandInput
        placeholder="What do you need?"
        value={query}
        onValueChange={setQuery}
        onKeyDown={handleKeyDown}
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-4">
            <IconSparkles size={20} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No commands match &ldquo;{query}&rdquo;
            </p>
            <button
              className="text-sm text-primary underline underline-offset-2"
              onClick={() => {
                setOpen(false);
                ctx.openChat(query);
              }}
            >
              Ask BitBit instead
            </button>
          </div>
        </CommandEmpty>

        {/* Switch to X — always at the top when modes are enabled */}
        {switchToModes.length > 0 && (
          <>
            <CommandGroup heading="Switch mode">
              {switchToModes.map((m) => {
                const meta = MODE_META[m];
                const Icon = meta.icon;
                return (
                  <CommandItem
                    key={`switch-${m}`}
                    value={`switch to ${m} mode ${m}`}
                    onSelect={() => executeModeSwitch(m)}
                  >
                    <Icon size={16} className="text-muted-foreground" />
                    <span>Switch to {meta.label}</span>
                    <CommandShortcut>{meta.shortcut}</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Recent commands */}
        {recentCommands.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentCommands.map((cmd) => (
                <CommandItem
                  key={`recent-${cmd.id}`}
                  value={cmd.id}
                  onSelect={() => executeCommand(cmd)}
                >
                  {cmd.icon && <cmd.icon size={16} />}
                  <span>{cmd.label}</span>
                  {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Grouped commands */}
        {sortedCategories.map(([category, cmds]) => (
          <CommandGroup key={category} heading={CATEGORY_META[category].label}>
            {cmds.slice(0, query ? 10 : 6).map((cmd) => (
              <CommandItem
                key={cmd.id}
                value={`${cmd.label} ${cmd.keywords.join(' ')}`}
                onSelect={() => executeCommand(cmd)}
              >
                {cmd.icon && <cmd.icon size={16} />}
                <div className="flex flex-col gap-0">
                  <span>{cmd.label}</span>
                  {cmd.description && (
                    <span className="text-sm text-muted-foreground">{cmd.description}</span>
                  )}
                </div>
                {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {/* AI fallthrough hint */}
        {query.trim() && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Ask BitBit">
              <CommandItem
                value={`ask bitbit ${query}`}
                onSelect={() => {
                  setOpen(false);
                  ctx.openChat(query);
                }}
              >
                <IconSparkles size={16} />
                <span>Ask BitBit: &ldquo;{query}&rdquo;</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export default Summon;
