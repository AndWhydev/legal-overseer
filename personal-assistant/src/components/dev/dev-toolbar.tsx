'use client';

import React, { useEffect, useState } from 'react';
import { IconChevronDown, IconChevronRight, IconRefresh, IconLogin, IconLogout, IconUser, IconSun, IconMoon } from '@tabler/icons-react';
import { ALL_MODULES } from '@/lib/modules/registry';
import {
  useDevOverrides,
  setDevOverride,
  clearDevOverrides,
  getDevOverrides,
} from '@/lib/dev/dev-overrides';
import { useEnabledModules } from '@/lib/modules/use-enabled-modules';
import { TABS } from '@/components/dashboard/spa-shell';
import { INDUSTRY_PACKS } from '@/lib/industry/registry';
import { createClient } from '@/lib/supabase/client';
import { isSeedActive, setSeedActive } from '@/lib/dev/seed-data';
import { DEFAULT_THEME_NAME, resolveThemeColor, resolveStoredThemeName, themeToColorMode, type ThemeName } from '@/lib/theme/defaults';

if (process.env.NODE_ENV !== 'development') {
  // This entire module is dead-code-eliminated in production
}

const PLANS = ['starter', 'beta', 'growth', 'scale', 'enterprise'] as const;
const PROFILES = ['essential', 'full'] as const;

export function DevToolbar() {
  const [showModules, setShowModules] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [seedOn, setSeedOn] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(DEFAULT_THEME_NAME);
  const overrides = useDevOverrides();
  const { modules, composition } = useEnabledModules();

  useEffect(() => {
    setMounted(true);
    setSeedOn(isSeedActive());
    setCurrentTheme(resolveStoredThemeName(localStorage.getItem('bb-theme')));
  }, []);

  const handleThemeToggle = (theme: ThemeName) => {
    setCurrentTheme(theme);
    const colorMode = themeToColorMode(theme);
    localStorage.setItem('bb-theme', theme);
    localStorage.setItem('bitbit-theme', colorMode);
    const html = document.documentElement;
    html.className = colorMode;
    html.setAttribute('data-theme', theme);
    html.style.colorScheme = colorMode;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolveThemeColor(colorMode, theme));
  };

  if (process.env.NODE_ENV !== 'development') return null;
  if (!mounted) return null;

  const activeIndustry = overrides?.industry ?? null;
  const activePlan = overrides?.plan ?? null;
  const activeProfile = overrides?.ui_profile ?? null;
  const moduleOverrides = overrides?.enabled_modules ?? null;

  const handleIndustry = (industry: string) => {
    setDevOverride('industry', industry);
    if (getDevOverrides()?.enabled_modules !== undefined) {
      setDevOverride('enabled_modules', null);
    }
  };

  const handlePlan = (plan: string) => {
    setDevOverride('plan', plan);
    if (getDevOverrides()?.enabled_modules !== undefined) {
      setDevOverride('enabled_modules', null);
    }
  };

  const handleProfile = (profile: string) => {
    setDevOverride('ui_profile', profile);
  };

  const handleModuleToggle = (moduleId: string) => {
    const current = moduleOverrides ? [...moduleOverrides] : [...modules];
    const idx = current.indexOf(moduleId);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(moduleId);
    }
    setDevOverride('enabled_modules', current);
  };

  const handleReset = () => {
    clearDevOverrides();
  };

  const handleNavigate = (tabId: string) => {
    window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: tabId } }));
  };

  const isOverriding = overrides !== null;

  return (
    <div className="flex flex-col text-sm">
      {/* Seed Data */}
      <Section title="Seed Data">
        <label className={`flex items-center gap-2 text-sm cursor-pointer ${seedOn ? 'text-sidebar-foreground/70' : 'text-sidebar-foreground/50'}`}>
          <input
            type="checkbox"
            checked={seedOn}
            onChange={() => {
              const next = !seedOn;
              setSeedOn(next);
              setSeedActive(next);
            }}
            className="accent-current"
          />
          {seedOn ? 'Seed data active' : 'Enable seed data'}
        </label>
      </Section>

      {/* Theme */}
      <Section title="Theme">
        <div className="flex gap-1">
          {(['midnight', 'aurora', 'light'] as const).map(t => {
            const active = currentTheme === t;
            return (
              <button
                key={t}
                onClick={() => handleThemeToggle(t)}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm cursor-pointer ${
                  active
                    ? 'border border-sidebar-foreground/20 bg-primary/10 text-sidebar-foreground/80 font-medium'
                    : 'border border-sidebar-foreground/[0.08] bg-sidebar-foreground/[0.04] text-sidebar-foreground/50'
                }`}
              >
                {t === 'midnight' ? <IconMoon size={12} /> : <IconSun size={12} />}
                {t}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Industry */}
      <Section title="Industry">
        <ChipGroup
          options={Object.keys(INDUSTRY_PACKS)}
          value={activeIndustry}
          onChange={handleIndustry}
        />
      </Section>

      {/* Plan Tier */}
      <Section title="Plan Tier">
        <ChipGroup
          options={PLANS as unknown as string[]}
          value={activePlan}
          onChange={handlePlan}
        />
      </Section>

      {/* UI Profile */}
      <Section title="UI Profile">
        <ChipGroup
          options={PROFILES as unknown as string[]}
          value={activeProfile}
          onChange={handleProfile}
        />
      </Section>

      {/* Quick Navigate */}
      <Section title="Quick Navigate">
        <div className="flex flex-wrap gap-1">
          {TABS.slice(0, 12).map(tab => (
            <button
              key={tab.id}
              onClick={() => handleNavigate(tab.id)}
              className={`px-2 py-1 rounded-lg border border-sidebar-foreground/[0.08] bg-sidebar-foreground/[0.04] text-sm cursor-pointer ${
                modules.includes(tab.id) ? 'text-foreground' : 'text-muted-foreground line-through'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Module Overrides (collapsible) */}
      <div className="border-b border-sidebar-border">
        <button
          onClick={() => setShowModules(!showModules)}
          className="w-full flex items-center gap-2 px-4 py-2 bg-transparent border-none text-sidebar-foreground/50 text-sm font-medium cursor-pointer uppercase tracking-wide"
        >
          {showModules ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
          Module Overrides
        </button>
        {showModules && (
          <div className="px-4 pb-3 flex flex-col gap-0.5">
            {ALL_MODULES.map(mod => {
              const checked = moduleOverrides
                ? moduleOverrides.includes(mod)
                : modules.includes(mod);
              return (
                <label key={mod} className={`flex items-center gap-2 text-sm cursor-pointer py-0.5 ${
                  checked ? 'text-sidebar-foreground' : 'text-sidebar-foreground/35'
                }`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleModuleToggle(mod)}
                    className="accent-current"
                  />
                  {mod}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Dev Auth */}
      <DevAuthSection />

      {/* Status + Reset */}
      <div className="px-4 py-3 flex justify-between items-center">
        <span className="text-sm text-sidebar-foreground/35">
          {modules.length} modules · {composition.profileId}
        </span>
        <button
          onClick={handleReset}
          disabled={!isOverriding}
          className={`flex items-center gap-1 px-3 py-1 rounded-lg border border-sidebar-foreground/[0.08] text-sm font-medium ${
            isOverriding
              ? 'bg-destructive/15 text-destructive cursor-pointer'
              : 'bg-transparent text-muted-foreground cursor-default'
          }`}
        >
          <IconRefresh size={12} />
          Reset to DB
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-sidebar-border">
      <div className="text-sm font-medium text-sidebar-foreground/50 uppercase tracking-wide mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(opt => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-3 py-1 rounded-lg text-sm cursor-pointer ${
              active
                ? 'border border-sidebar-foreground/20 bg-primary/10 text-sidebar-foreground/70 font-medium'
                : 'border border-sidebar-foreground/[0.08] bg-sidebar-foreground/[0.04] text-sidebar-foreground/50'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function DevAuthSection() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setError('Supabase not configured');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(authError.message);
      setStatus('error');
      return;
    }

    setUserEmail(data.user?.email ?? null);
    setStatus('idle');
    setPassword('');
    window.location.reload();
  };

  const handleLogout = async () => {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUserEmail(null);
    window.location.reload();
  };

  return (
    <Section title="Dev Auth">
      {userEmail ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <IconUser size={12} className="shrink-0 text-sidebar-foreground/70" />
            <span className="text-sm text-sidebar-foreground/70 overflow-hidden text-ellipsis whitespace-nowrap">
              {userEmail}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 px-2 py-1 rounded-lg shrink-0 border border-sidebar-foreground/[0.08] bg-destructive/10 text-destructive text-sm font-medium cursor-pointer"
          >
            <IconLogout size={11} />
            Sign out
          </button>
        </div>
      ) : (
        <form onSubmit={handleLogin} className="flex flex-col gap-2">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-sidebar-border bg-sidebar-foreground/[0.06] text-sidebar-foreground text-sm outline-none"
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-sidebar-border bg-sidebar-foreground/[0.06] text-sidebar-foreground text-sm outline-none"
            autoComplete="current-password"
          />
          {status === 'error' && (
            <span className="text-sm text-destructive">{error}</span>
          )}
          <button
            type="submit"
            disabled={status === 'loading' || !email.trim() || !password}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-sidebar-foreground/[0.12] bg-primary/10 text-sidebar-foreground/70 text-sm font-medium disabled:opacity-40"
            style={{ cursor: status === 'loading' ? 'wait' : 'pointer' }}
          >
            <IconLogin size={13} />
            {status === 'loading' ? 'Signing in...' : 'Sign in with password'}
          </button>
        </form>
      )}
    </Section>
  );
}
