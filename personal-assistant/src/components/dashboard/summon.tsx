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
import { IconSparkles, IconSearch } from '@tabler/icons-react';
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

// ---------------------------------------------------------------------------
// Register built-in commands on module load
// ---------------------------------------------------------------------------

registerCommands(BUILT_IN_COMMANDS);

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
  const registeredRef = useRef(false);

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

  // Load recent on open
  useEffect(() => {
    if (open) {
      setRecentIds(getRecentCommands());
      setQuery('');
    }
  }, [open]);

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
        // Slight delay to let the chat tab mount
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
    [ctx],
  );

  // Get commands based on query
  const commands = query.trim()
    ? searchCommands(query, activeTab)
    : getContextualCommands(activeTab);

  // Group commands by category
  const grouped = new Map<CommandCategory, SummonCommand[]>();
  for (const cmd of commands) {
    const list = grouped.get(cmd.category) ?? [];
    list.push(cmd);
    grouped.set(cmd.category, list);
  }

  // Get recent commands for the "Recent" section (only when no query)
  const recentCommands = !query.trim()
    ? recentIds
        .map((id) => commands.find((c) => c.id === id))
        .filter(Boolean) as SummonCommand[]
    : [];

  // Sort categories by their defined order
  const sortedCategories = [...grouped.entries()].sort(
    ([a], [b]) => CATEGORY_META[a].order - CATEGORY_META[b].order,
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Summon"
      description={`${activeTab} — Ctrl+K to search commands`}
    >
      <CommandInput
        placeholder="What do you need?"
        value={query}
        onValueChange={setQuery}
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
