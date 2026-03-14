'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SFChevronDown, SFBuilding2, SFCheckmark } from 'sf-symbols-lib';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Org {
  id: string;
  name: string;
  plan_tier: string;
}

interface OrgSwitcherProps {
  onOrgChange?: (orgId: string) => void;
}

export function OrgSwitcher({ onOrgChange }: OrgSwitcherProps) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrg] = useState<Org | null>(null);
  const [open, setOpen] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const client = createClient();
    if (client) setSupabase(client);
  }, []);

  const fetchOrgs = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get user's current org
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    // Get all orgs the user belongs to (via profiles or org_members if exists)
    const { data: userOrgs } = await supabase
      .from('organisations')
      .select('id, name, plan_tier')
      .order('name');

    if (userOrgs) {
      setOrgs(userOrgs);
      const current = userOrgs.find(o => o.id === profile?.org_id) ?? userOrgs[0] ?? null;
      setActiveOrg(current);
    }
  }, [supabase]);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSwitch = async (org: Org) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('profiles').update({ org_id: org.id }).eq('id', user.id);
    setActiveOrg(org);
    setOpen(false);
    onOrgChange?.(org.id);
  };

  if (!activeOrg) return null;

  const tierColors: Record<string, string> = {
    free: 'text-muted-foreground',
    starter: 'text-blue-400',
    pro: 'text-[var(--bb-orange,#FF5A1F)]',
    enterprise: 'text-purple-400',
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md border border-border/30 bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <SFBuilding2 size={16} className="shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{activeOrg.name}</p>
          <p className={`text-xs capitalize ${tierColors[activeOrg.plan_tier] ?? 'text-muted-foreground'}`}>
            {activeOrg.plan_tier || 'Free'} plan
          </p>
        </div>
        <SFChevronDown
          size={14}
          className="shrink-0 text-muted-foreground transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && orgs.length > 1 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border/50 bg-background shadow-lg">
          {orgs.map(org => (
            <button
              key={org.id}
              onClick={() => handleSwitch(org)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/30 first:rounded-t-md last:rounded-b-md"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-foreground">{org.name}</p>
                <p className={`text-xs capitalize ${tierColors[org.plan_tier] ?? 'text-muted-foreground'}`}>
                  {org.plan_tier || 'Free'}
                </p>
              </div>
              {org.id === activeOrg.id && (
                <SFCheckmark size={14} className="shrink-0 text-[var(--bb-orange,#FF5A1F)]" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default OrgSwitcher;
