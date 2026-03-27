'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IconSearch, IconX, IconUser, IconFileText, IconCurrencyDollar, IconBriefcase, IconBuilding } from '@tabler/icons-react';

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
  contact:  { label: 'Contacts',  icon: <IconUser size={14} />,          tab: 'contacts' },
  lead:     { label: 'Leads',     icon: <IconBriefcase size={14} />,     tab: 'leads' },
  invoice:  { label: 'Invoices',  icon: <IconCurrencyDollar size={14} />,tab: 'invoices' },
  proposal: { label: 'Proposals', icon: <IconFileText size={14} />,      tab: 'approvals' },
  tender:   { label: 'Tenders',   icon: <IconBuilding size={14} />,      tab: 'tenders' },
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
      className="bb-search-backdrop"
      onClick={() => setOpen(false)}
    >
      {/* Modal */}
      <div
        className="bb-search-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="bb-search-input-row">
          <IconSearch size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contacts, invoices, leads..."
            className="bb-search-input bb-naked-input"
          />
          {query && (
            <button onClick={() => setQuery('')} className="bb-search-clear">
              <IconX size={16} />
            </button>
          )}
          <button
            type="button"
            className="bb-search-kbd-esc"
            onClick={() => setOpen(false)}
            aria-label="Close search"
          >ESC</button>
        </div>

        {/* Results */}
        <div className="bb-search-results">
          {loading && (
            <div className="bb-search-empty">Searching...</div>
          )}

          {!loading && !query && recentSearches.length > 0 && (
            <div className="bb-search-group">
              <div className="bb-search-group-title">
                Recent Searches
              </div>
              {recentSearches.map((s) => (
                <button
                  key={s}
                  className="bb-search-item"
                  onClick={() => setQuery(s)}
                >
                  <span className="bb-search-item-title">{s}</span>
                </button>
              ))}
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="bb-search-empty">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {!loading && Object.entries(grouped).map(([type, items]) => {
            const meta = TYPE_META[type];
            return (
              <div key={type} className="bb-search-group">
                <div className="bb-search-group-title">
                  {meta?.icon}
                  {meta?.label ?? type}
                </div>
                {items.map((result) => {
                  const idx = flatIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={result.id}
                      className={`bb-search-item${isSelected ? ' bb-search-item--selected' : ''}`}
                      onClick={() => selectResult(result)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span className="bb-search-item-title">{result.title}</span>
                      {result.subtitle && (
                        <span className="bb-search-item-subtitle">{result.subtitle}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="bb-search-footer">
          <span><kbd>↑↓</kbd>navigate</span>
          <button
            type="button"
            onClick={() => {
              if (results[selectedIndex]) selectResult(results[selectedIndex]);
            }}
            aria-label="Select result"
          ><kbd>↵</kbd>select</button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close search"
          ><kbd>esc</kbd>close</button>
        </div>
      </div>
    </div>
  );
}

export default GlobalSearch;
