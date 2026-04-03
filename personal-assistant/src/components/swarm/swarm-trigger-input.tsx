'use client';

import React, { useState, useCallback, useRef } from 'react';
import { BUILTIN_TEMPLATES } from '@/lib/swarm/templates';

// ── Component ───────────────────────────────────────────────────────────────

interface SwarmTriggerInputProps {
  onTrigger: (input: string, templateSlug?: string) => void;
}

export function SwarmTriggerInput({ onTrigger }: SwarmTriggerInputProps) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async () => {
    if (!value.trim() || submitting) return;
    setSubmitting(true);
    try {
      onTrigger(value.trim());
      setValue('');
    } finally {
      setSubmitting(false);
    }
  }, [value, submitting, onTrigger]);

  const handleTemplateClick = useCallback((slug: string, name: string) => {
    const prompts: Record<string, string> = {
      'pitch-prep': 'Prepare pitch for ',
      'client-onboarding': 'Onboard ',
      'end-of-month': 'Run end of month review',
    };
    const prompt = prompts[slug] || `Run ${name} `;
    setValue(prompt);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="relative">
      <div className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-widest">Command your team</div>
      <div
        className={`flex items-center gap-3 rounded-xl bg-card px-4 py-3 border transition-colors ${
          focused ? 'border-ring' : 'border-border'
        }`}
      >
        <input
          ref={inputRef}
          className="flex-1 bg-transparent border-none outline-none text-foreground text-sm tracking-tight"
          placeholder='Try "Prepare pitch for Thomson" or "Run end of month"'
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
        />
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium border-none whitespace-nowrap transition-all ${
            !value.trim() || submitting
              ? 'bg-primary/40 text-primary-foreground cursor-not-allowed opacity-40'
              : 'bg-primary text-primary-foreground cursor-pointer hover:opacity-90'
          }`}
          onClick={handleSubmit}
          disabled={!value.trim() || submitting}
        >
          {submitting ? 'Deploying...' : 'Deploy Swarm'}
        </button>
      </div>

      {/* Quick template buttons */}
      <div className="flex gap-1.5 mt-2 flex-wrap">
        {BUILTIN_TEMPLATES.map(template => (
          <button
            key={template.slug}
            className={`px-3 py-1 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
              hoveredTemplate === template.slug
                ? 'bg-muted text-foreground border-border'
                : 'bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground'
            }`}
            onClick={() => handleTemplateClick(template.slug, template.name)}
            onMouseEnter={() => setHoveredTemplate(template.slug)}
            onMouseLeave={() => setHoveredTemplate(null)}
          >
            {template.name}
          </button>
        ))}
      </div>
    </div>
  );
}
