import type { NavSection } from '@/docs.config'

export function filterNavByVisibility(
  sections: NavSection[],
  isAuthenticated: boolean,
): NavSection[] {
  if (isAuthenticated) return sections
  return sections.filter(s => s.visibility === 'public')
}
