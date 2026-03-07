'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, User, FileText, DollarSign, Briefcase, Building2 } from 'lucide-react';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  relevance: number;
}

interface GlobalSearchProps {
  onNavigate?: (tabId: string) => void;
}

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; tab: string }> = {
  contact:  { label: 'Contacts',  icon: <User size={14} />,       tab: 'contacts' },
  lead:     { label: 'Leads',     icon: <Briefcase size={14} />,   tab: 'leads' },
  invoice:  { label: 'Invoices',  icon: <DollarSign size={14} />,  tab: 'invoices' },
  proposal: { label: 'Proposals', icon: <FileText size={14} />,    tab: 'approvals' },
  tender:   { label: 'Tenders',   icon: <Building2 size={14} />,   tab: 'tenders' },
};

const RECENT_KEY = 'bitbit-recent-searches';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, MAX_RECENT);
  } catch { return []; }
}

function saveRecentSearch(q: string) {
  const recent = getRecentSearches().filter((s) => s !== q);
  recent.unshift(q);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function GlobalSearch({ onNavigate }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cmd+K / Ctrl+K listener
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

  // Listen for programmatic open (from / hotkey or other triggers)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('bb-search-open', handler);
    return () => window.removeEventListener('bb-search-open', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); return; }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
          setSelectedIndex(0);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }, 300);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const selectResult = useCallback((result: SearchResult) => {
    saveRecentSearch(query);
    setOpen(false);
    const meta = TYPE_META[result.type];
    if (meta && onNavigate) {
      onNavigate(meta.tab);
    }
  }, [query, onNavigate]);

  // Keyboard nav
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      selectResult(results[selectedIndex]);
    }
  }, [results, selectedIndex, selectResult]);

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  // Flat index for keyboard nav
  let flatIndex = 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-xl mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <Search size={18} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contacts, invoices, leads..."
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground p-1">
              <X size={16} />
            </button>
          )}
          <kbd className="hidden sm:inline-block text-[11px] text-muted-foreground bg-muted px-2 py-1 rounded-md border border-border">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Searching...</div>
          )}

          {!loading && !query && recentSearches.length > 0 && (
            <div className="p-3">
              <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Recent Searches
              </div>
              {recentSearches.map((s) => (
                <button
                  key={s}
                  className="w-full text-left px-3 py-2.5 text-[14px] text-foreground hover:bg-muted rounded-lg"
                  onClick={() => setQuery(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {!loading && Object.entries(grouped).map(([type, items]) => {
            const meta = TYPE_META[type];
            return (
              <div key={type} className="p-3">
                <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  {meta?.icon}
                  {meta?.label ?? type}
                </div>
                {items.map((result) => {
                  const idx = flatIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={result.id}
                      className={`w-full text-left px-3 py-2.5 text-[14px] rounded-lg flex items-center justify-between transition-colors ${
                        isSelected ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted'
                      }`}
                      onClick={() => selectResult(result)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span className="font-medium truncate">{result.title}</span>
                      {result.subtitle && (
                        <span className="text-xs text-muted-foreground ml-2 truncate">{result.subtitle}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center gap-4 text-[11px] text-muted-foreground">
          <span><kbd className="bg-muted px-1.5 py-0.5 rounded-md border border-border text-[11px]">↑↓</kbd> navigate</span>
          <span><kbd className="bg-muted px-1.5 py-0.5 rounded-md border border-border text-[11px]">↵</kbd> select</span>
          <span><kbd className="bg-muted px-1.5 py-0.5 rounded-md border border-border text-[11px]">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

export default GlobalSearch;
