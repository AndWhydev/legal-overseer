'use client';

import { useState, useEffect, useMemo, useCallback, createContext, useContext } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getEnabledModules, getComposition, FULL_COMPOSITION, ALL_MODULES } from './registry';
import type { UIComposition } from './registry';
import { getDevOverrides } from '@/lib/dev/dev-overrides';

interface EnabledModulesState {
  modules: string[];
  composition: UIComposition;
  industry?: string;
  loading: boolean;
}

const EnabledModulesContext = createContext<EnabledModulesState>({
  modules: [...ALL_MODULES], // default: show all while loading
  composition: FULL_COMPOSITION,
  industry: undefined,
  loading: true,
});

export { EnabledModulesContext };

/**
 * Hook to get the list of enabled module IDs for the current org.
 * Fetches the org's plan + enabled_modules from Supabase once, then caches.
 */
export function useEnabledModules(): EnabledModulesState {
  return useContext(EnabledModulesContext);
}

/**
 * Fetch enabled modules for the current user's org.
 * Used by the context provider.
 */
export function useEnabledModulesFetch(): EnabledModulesState {
  const [state, setState] = useState<EnabledModulesState>({
    modules: [...ALL_MODULES],
    composition: FULL_COMPOSITION,
    industry: undefined,
    loading: true,
  });

  const load = useCallback(async (cancelled = false) => {
    try {
      // Dev toolbar overrides — skip DB entirely
      if (process.env.NODE_ENV === 'development') {
        const devOv = getDevOverrides();
        if (devOv) {
          const plan = devOv.plan ?? 'growth';
          const mods = devOv.enabled_modules !== undefined ? devOv.enabled_modules : null;
          const profile = devOv.ui_profile ?? 'full';
          const industry = devOv.industry;
          setState({
            modules: getEnabledModules(plan, mods, industry),
            composition: getComposition(profile, industry),
            industry,
            loading: false,
          });
          return;
        }
      }

      const client = createClient();
      if (!client) {
        setState({ modules: [...ALL_MODULES], composition: FULL_COMPOSITION, loading: false });
        return;
      }

      const { data: { user } } = await client.auth.getUser();
      if (!user || cancelled) {
        setState({ modules: [...ALL_MODULES], composition: FULL_COMPOSITION, loading: false });
        return;
      }

      const { data: profile } = await client
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();

      if (!profile?.org_id || cancelled) {
        setState({ modules: [...ALL_MODULES], composition: FULL_COMPOSITION, loading: false });
        return;
      }

      // Query plan first (always exists), then try optional columns separately
      // to avoid PostgREST errors when columns haven't been migrated yet
      let plan = 'starter';
      let overrides: string[] | null = null;
      let uiProfile = 'full';
      let industry: string | undefined;

      const { data: org, error: orgErr } = await client
        .from('organisations')
        .select('plan, enabled_modules, ui_profile, industry')
        .eq('id', profile.org_id)
        .single();

      if (org && !orgErr) {
        plan = (org.plan as string) ?? 'starter';
        overrides = (org.enabled_modules as string[] | null) ?? null;
        uiProfile = (org.ui_profile as string) ?? 'full';
        industry = (org.industry as string) ?? undefined;
      } else {
        // Fallback: query only the plan column (always exists)
        const { data: orgBasic } = await client
          .from('organisations')
          .select('plan')
          .eq('id', profile.org_id)
          .single();
        plan = (orgBasic?.plan as string) ?? 'starter';
      }

      if (cancelled) return;

      const modules = getEnabledModules(plan, overrides, industry);
      const composition = getComposition(uiProfile, industry);

      setState({ modules, composition, industry, loading: false });
    } catch {
      if (!cancelled) {
        setState({ modules: [...ALL_MODULES], composition: FULL_COMPOSITION, industry: undefined, loading: false });
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(cancelled);
    return () => { cancelled = true; };
  }, [load]);

  // Re-run load when dev overrides change
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const handler = () => load();
    window.addEventListener('bb-dev-override-change', handler);
    return () => window.removeEventListener('bb-dev-override-change', handler);
  }, [load]);

  return state;
}

/**
 * Filter any array of objects with an `id` field to only enabled modules.
 */
export function useFilteredByModules<T extends { id: string }>(items: T[]): T[] {
  const { modules } = useEnabledModules();
  return useMemo(
    () => items.filter(item => modules.includes(item.id)),
    [items, modules],
  );
}
