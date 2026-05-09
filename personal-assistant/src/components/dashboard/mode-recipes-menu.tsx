'use client';

/**
 * mode-recipes-menu.tsx — Cross-mode recipe launcher.
 *
 * Surfaces the recipes from `mode-recipes.ts` (#102) whose origin matches
 * the active mode, in a small dropdown the user can open from the topbar.
 * Clicking an item kicks off `executeRecipe` — which fans out the recipe's
 * Send-To steps via the registry from #97.
 *
 * Returns null when no recipes match the active mode (the dropdown should
 * not crowd the topbar with empty state).
 *
 * Foundation only:
 *   - The current basePayload is `{}` — recipes can still fire their steps,
 *     but the destination components see an empty payload and have to fall
 *     back to defaults. Real per-mode payload sourcing (selected message
 *     id, focused task id, current invoice draft) lands in a follow-up PR.
 *   - No tooling for "saved recipes" or user-authored recipes — only the
 *     four canonical ones from #102.
 */

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  executeRecipe,
  getRecipesByOriginMode,
  type ModeRecipe,
} from '@/lib/dashboard/mode-recipes';
import type { Mode } from '@/lib/dashboard/mode-store';

// ─── Component ────────────────────────────────────────────────────────────────

export interface ModeRecipesMenuProps {
  mode: Mode;
  /**
   * Optional payload threaded into every step of the executed recipe.
   * Defaults to `{}` — see file header for follow-up scoping.
   */
  basePayload?: unknown;
  className?: string;
}

export function ModeRecipesMenu({ mode, basePayload = {}, className }: ModeRecipesMenuProps) {
  const recipes = getRecipesByOriginMode(mode);
  const [running, setRunning] = useState<string | null>(null);

  // No recipes for this mode → render nothing rather than an empty dropdown.
  if (recipes.length === 0) return null;

  async function handleRun(recipe: ModeRecipe) {
    setRunning(recipe.id);
    try {
      await executeRecipe(recipe, basePayload);
    } finally {
      setRunning(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={className}
          aria-label="Cross-mode recipes"
        >
          <Sparkles size={14} className="shrink-0" />
          <span className="ml-1.5 hidden sm:inline">Recipes</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Cross-mode recipes</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {recipes.map((recipe) => (
          <DropdownMenuItem
            key={recipe.id}
            disabled={running === recipe.id}
            onSelect={(e) => {
              // onSelect closes the menu by default; we want that.
              e.preventDefault();
              void handleRun(recipe);
            }}
            className="flex flex-col items-start gap-0.5 py-2"
          >
            <span className="text-sm font-medium leading-tight">{recipe.name}</span>
            <span className="text-xs text-muted-foreground leading-snug">
              {recipe.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
