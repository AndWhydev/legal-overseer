'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { BUILTIN_TEMPLATES } from '@/lib/swarm/templates';
import { S, C } from '@/lib/styles/design-tokens';

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  container: {
    position: 'relative' as const,
  },
  inputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: C.bgCard,
    backdropFilter: 'blur(20px)',
    borderRadius: '12px',
    padding: '12px 16px',
    border: `1px solid ${C.borderSubtle}`,
    transition: 'border-color 0.15s ease',
  },
  inputWrapperFocused: {
    borderColor: C.borderFocus,
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: C.textPrimary,
    fontSize: '14px',
    fontFamily: 'inherit',
    letterSpacing: '-0.01em',
  },
  triggerButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    background: 'var(--btn-primary-bg, #F1F5F9)',
    color: 'var(--btn-primary-fg, #0a0f1a)',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap' as const,
  },
  triggerButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  templatesRow: {
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
    flexWrap: 'wrap' as const,
  },
  templateChip: {
    padding: '4px 12px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: `1px solid ${C.borderSubtle}`,
    background: C.bgHover,
    color: C.textSecondary,
    transition: 'all 0.15s ease',
  },
  templateChipHover: {
    background: C.bgHoverStrong,
    color: C.textPrimary,
    borderColor: C.borderHover,
  },
  label: {
    fontSize: '14px',
    color: C.textMuted,
    marginBottom: '8px',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
};

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
    // Pre-fill the input with a natural language trigger
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
    <div style={styles.container}>
      <div style={styles.label}>Command your team</div>
      <div
        style={{
          ...styles.inputWrapper,
          ...(focused ? styles.inputWrapperFocused : {}),
        }}
      >
        <input
          ref={inputRef}
          style={styles.input}
          placeholder='Try "Prepare pitch for Thomson" or "Run end of month"'
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
        />
        <button
          style={{
            ...styles.triggerButton,
            ...((!value.trim() || submitting) ? styles.triggerButtonDisabled : {}),
          }}
          onClick={handleSubmit}
          disabled={!value.trim() || submitting}
        >
          {submitting ? 'Deploying...' : 'Deploy Swarm'}
        </button>
      </div>

      {/* Quick template buttons */}
      <div style={styles.templatesRow}>
        {BUILTIN_TEMPLATES.map(template => (
          <button
            key={template.slug}
            style={{
              ...styles.templateChip,
              ...(hoveredTemplate === template.slug ? styles.templateChipHover : {}),
            }}
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
