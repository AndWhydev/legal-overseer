'use client';

import React, { useEffect, useState } from 'react';
import { IconSettings, IconX, IconChevronDown, IconChevronRight, IconRefresh, IconLogin, IconLogout, IconUser, IconSun, IconMoon } from '@tabler/icons-react';
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
  const [open, setOpen] = useState(false);
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
    <>
      {/* Collapsed pill */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed bottom-4 right-4 z-[9990] flex items-center gap-2 px-3 py-2 rounded-[20px] border border-white/15 text-white text-sm font-medium font-mono cursor-pointer backdrop-blur-sm ${
            isOverriding
              ? 'bg-gradient-to-br from-violet-600 to-indigo-600'
              : 'bg-black/75'
          }`}
        >
          <IconSettings size={14} />
          Dev
          {isOverriding && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          )}
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div className="fixed bottom-4 right-4 z-[9990] w-80 max-h-[calc(100vh-32px)] overflow-y-auto rounded-xl border border-white/[0.12] bg-[rgba(15,15,20,0.95)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] text-slate-200 text-sm font-sans">
          {/* Header */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-white/[0.08]">
            <span className="font-medium text-sm font-mono">
              BitBit Dev Toolbar
            </span>
            <button onClick={() => setOpen(false)} className="bg-transparent border-none text-slate-400 cursor-pointer p-0.5">
              <IconX size={16} />
            </button>
          </div>

          {/* Seed Data */}
          <Section title="Seed Data">
            <label className={`flex items-center gap-2 text-sm cursor-pointer ${seedOn ? 'text-emerald-400' : 'text-slate-400'}`}>
              <input
                type="checkbox"
                checked={seedOn}
                onChange={() => {
                  const next = !seedOn;
                  setSeedOn(next);
                  setSeedActive(next);
                }}
                className="accent-emerald-400"
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
                        ? 'border border-violet-600 bg-violet-600/20 text-violet-300 font-medium'
                        : 'border border-white/10 bg-white/5 text-slate-400'
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
                  className={`px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-sm cursor-pointer ${
                    modules.includes(tab.id) ? 'text-foreground' : 'text-muted-foreground line-through'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Module Overrides (collapsible) */}
          <div className="border-b border-white/[0.08]">
            <button
              onClick={() => setShowModules(!showModules)}
              className="w-full flex items-center gap-2 px-4 py-2 bg-transparent border-none text-slate-400 text-sm font-medium cursor-pointer uppercase tracking-wide"
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
                      checked ? 'text-slate-200' : 'text-slate-500'
                    }`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleModuleToggle(mod)}
                        className="accent-violet-600"
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
            <span className="text-sm text-slate-500">
              {modules.length} modules · {composition.profileId}
            </span>
            <button
              onClick={handleReset}
              disabled={!isOverriding}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg border border-white/10 text-sm font-medium ${
                isOverriding
                  ? 'bg-red-500/15 text-red-400 cursor-pointer'
                  : 'bg-transparent text-muted-foreground cursor-default'
              }`}
            >
              <IconRefresh size={12} />
              Reset to DB
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-white/[0.08]">
      <div className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-2">
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
                ? 'border border-violet-600 bg-violet-600/20 text-violet-300 font-medium'
                : 'border border-white/10 bg-white/5 text-slate-400'
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
            <IconUser size={12} className="shrink-0 text-emerald-400" />
            <span className="text-sm text-emerald-400 overflow-hidden text-ellipsis whitespace-nowrap">
              {userEmail}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 px-2 py-1 rounded-lg shrink-0 border border-white/10 bg-red-500/[0.12] text-red-400 text-sm font-medium cursor-pointer"
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
            className="w-full px-3 py-2 rounded-lg border border-white/[0.12] bg-white/[0.06] text-slate-200 text-sm outline-none"
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-white/[0.12] bg-white/[0.06] text-slate-200 text-sm outline-none"
            autoComplete="current-password"
          />
          {status === 'error' && (
            <span className="text-sm text-red-400">{error}</span>
          )}
          <button
            type="submit"
            disabled={status === 'loading' || !email.trim() || !password}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-violet-600/40 bg-violet-600/20 text-violet-300 text-sm font-medium disabled:opacity-40"
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
