'use client';

import React, { useEffect, useState } from 'react';
import { Settings, X, ChevronDown, ChevronRight, RotateCcw, LogIn, LogOut, User, Sun, Moon } from 'lucide-react';
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
    // Reset plan/modules so pack defaults apply
    if (getDevOverrides()?.enabled_modules !== undefined) {
      setDevOverride('enabled_modules', null);
    }
  };

  const handlePlan = (plan: string) => {
    setDevOverride('plan', plan);
    // When switching plan, clear module overrides so tier defaults apply
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
          style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 9990,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.15)',
            background: isOverriding
              ? 'linear-gradient(135deg, #7c3aed, #4f46e5)'
              : 'rgba(0,0,0,0.75)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'monospace',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <Settings size={14} />
          Dev
          {isOverriding && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#34d399', display: 'inline-block',
            }} />
          )}
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 9990,
          width: 320,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(15,15,20,0.95)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          color: '#e2e8f0',
          fontSize: 13,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>
              BitBit Dev Toolbar
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2,
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Seed Data */}
          <Section title="Seed Data">
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: seedOn ? '#34d399' : '#94a3b8', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={seedOn}
                onChange={() => {
                  const next = !seedOn;
                  setSeedOn(next);
                  setSeedActive(next);
                }}
                style={{ accentColor: '#34d399' }}
              />
              {seedOn ? 'Seed data active' : 'Enable seed data'}
            </label>
          </Section>

          {/* Theme */}
          <Section title="Theme">
            <div style={{ display: 'flex', gap: 4 }}>
              {(['midnight', 'aurora', 'light'] as const).map(t => {
                const active = currentTheme === t;
                return (
                  <button
                    key={t}
                    onClick={() => handleThemeToggle(t)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: 6,
                      border: active ? '1px solid #7c3aed' : '1px solid rgba(255,255,255,0.1)',
                      background: active ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)',
                      color: active ? '#c4b5fd' : '#94a3b8',
                      fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer',
                    }}
                  >
                    {t === 'midnight' ? <Moon size={12} /> : <Sun size={12} />}
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {TABS.slice(0, 12).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleNavigate(tab.id)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)',
                    color: modules.includes(tab.id) ? 'var(--text-primary)' : 'var(--text-dim)',
                    fontSize: 11,
                    cursor: 'pointer',
                    textDecoration: modules.includes(tab.id) ? 'none' : 'line-through',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Module Overrides (collapsible) */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setShowModules(!showModules)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', background: 'none', border: 'none',
                color: '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}
            >
              {showModules ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Module Overrides
            </button>
            {showModules && (
              <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {ALL_MODULES.map(mod => {
                  const checked = moduleOverrides
                    ? moduleOverrides.includes(mod)
                    : modules.includes(mod);
                  return (
                    <label key={mod} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 12, color: checked ? '#e2e8f0' : '#64748b',
                      cursor: 'pointer', padding: '2px 0',
                    }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleModuleToggle(mod)}
                        style={{ accentColor: '#7c3aed' }}
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
          <div style={{
            padding: '10px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {modules.length} modules · {composition.profileId}
            </span>
            <button
              onClick={handleReset}
              disabled={!isOverriding}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.1)',
                background: isOverriding ? 'rgba(239,68,68,0.15)' : 'transparent',
                color: isOverriding ? 'var(--bb-red)' : 'var(--text-dim)',
                fontSize: 11, fontWeight: 600, cursor: isOverriding ? 'pointer' : 'default',
              }}
            >
              <RotateCcw size={12} />
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
    <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
      }}>
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map(opt => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: active
                ? '1px solid #7c3aed'
                : '1px solid rgba(255,255,255,0.1)',
              background: active ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)',
              color: active ? '#c4b5fd' : '#94a3b8',
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
            }}
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
    // Reload to pick up the new session across all routes
    window.location.reload();
  };

  const handleLogout = async () => {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUserEmail(null);
    window.location.reload();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#e2e8f0',
    fontSize: 12,
    outline: 'none',
  };

  return (
    <Section title="Dev Auth">
      {userEmail ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <User size={12} style={{ flexShrink: 0, color: '#34d399' }} />
            <span style={{ fontSize: 11, color: '#34d399', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userEmail}
            </span>
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6, flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(239,68,68,0.12)',
              color: '#f87171', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <LogOut size={11} />
            Sign out
          </button>
        </div>
      ) : (
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete="current-password"
          />
          {status === 'error' && (
            <span style={{ fontSize: 11, color: '#f87171' }}>{error}</span>
          )}
          <button
            type="submit"
            disabled={status === 'loading' || !email.trim() || !password}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 6,
              border: '1px solid rgba(124,58,237,0.4)',
              background: 'rgba(124,58,237,0.2)',
              color: '#c4b5fd', fontSize: 12, fontWeight: 600,
              cursor: status === 'loading' ? 'wait' : 'pointer',
              opacity: (!email.trim() || !password) ? 0.4 : 1,
            }}
          >
            <LogIn size={13} />
            {status === 'loading' ? 'Signing in...' : 'Sign in with password'}
          </button>
        </form>
      )}
    </Section>
  );
}
