/**
 * Style Guide Repository Module
 *
 * Provides data access layer for style_guide table.
 * Used by Gatekeeper skill to fetch brand compliance rules.
 *
 * Style guide rules define brand standards for:
 * - Technical specs (resolution, fps, audio levels)
 * - Logo placement and sizing
 * - Brand colors and palettes
 * - Typography requirements
 */

import { getDatabase } from '../connection.js';

/**
 * Style guide rule entity representing a row in the style_guide table
 */
export interface StyleGuideRule {
  /** Unique rule identifier (e.g., 'sg-001') */
  id: string;
  /** Rule category: 'technical', 'logo', 'color', 'typography' */
  category: string;
  /** Rule name identifier (e.g., 'video_resolution', 'primary_logo') */
  ruleName: string;
  /** Type of rule: 'requirement', 'guideline', 'recommendation' */
  ruleType: string;
  /** JSON string containing rule value/parameters */
  ruleValue: string;
  /** Severity level for violations */
  severity: 'critical' | 'warning' | 'info';
  /** Human-readable rule description */
  description: string;
}

/**
 * Database row shape (snake_case)
 */
interface StyleGuideRow {
  id: string;
  category: string;
  rule_name: string;
  rule_type: string;
  rule_value: string;
  severity: string;
  description: string;
}

/**
 * Map database row (snake_case) to StyleGuideRule interface (camelCase)
 */
function mapRowToRule(row: StyleGuideRow): StyleGuideRule {
  return {
    id: row.id,
    category: row.category,
    ruleName: row.rule_name,
    ruleType: row.rule_type,
    ruleValue: row.rule_value,
    severity: row.severity as 'critical' | 'warning' | 'info',
    description: row.description,
  };
}

/**
 * Get all style guide rules
 *
 * @returns Array of all style guide rules
 *
 * @example
 * ```typescript
 * const rules = getStyleGuideRules();
 * for (const rule of rules) {
 *   console.log(`${rule.category}/${rule.ruleName}: ${rule.description}`);
 * }
 * ```
 */
export function getStyleGuideRules(): StyleGuideRule[] {
  const db = getDatabase();

  const rows = db
    .prepare('SELECT * FROM style_guide ORDER BY category, id')
    .all() as StyleGuideRow[];

  return rows.map(mapRowToRule);
}

/**
 * Get style guide rules by category
 *
 * @param category - Category to filter by (e.g., 'technical', 'logo')
 * @returns Array of rules in the specified category
 *
 * @example
 * ```typescript
 * const technicalRules = getStyleGuideByCategory('technical');
 * const audioRule = technicalRules.find(r => r.ruleName === 'audio_levels');
 * if (audioRule) {
 *   const spec = JSON.parse(audioRule.ruleValue);
 *   console.log(`Target LUFS: ${spec.integrated_lufs}`);
 * }
 * ```
 */
export function getStyleGuideByCategory(category: string): StyleGuideRule[] {
  const db = getDatabase();

  const rows = db
    .prepare('SELECT * FROM style_guide WHERE category = ? ORDER BY id')
    .all(category) as StyleGuideRow[];

  return rows.map(mapRowToRule);
}

/**
 * Get technical specification rules
 *
 * Shorthand for getStyleGuideByCategory('technical').
 * Includes video resolution, fps, audio levels, file formats.
 *
 * @returns Array of technical rules
 */
export function getTechnicalRules(): StyleGuideRule[] {
  return getStyleGuideByCategory('technical');
}

/**
 * Get logo placement and sizing rules
 *
 * Shorthand for getStyleGuideByCategory('logo').
 * Includes logo position, minimum size, clear space requirements.
 *
 * @returns Array of logo rules
 */
export function getLogoRules(): StyleGuideRule[] {
  return getStyleGuideByCategory('logo');
}

/**
 * Get brand color rules
 *
 * Shorthand for getStyleGuideByCategory('color').
 * Includes primary colors, secondary palette, color tolerance.
 *
 * @returns Array of color rules
 */
export function getColorRules(): StyleGuideRule[] {
  return getStyleGuideByCategory('color');
}

/**
 * Get typography rules
 *
 * Shorthand for getStyleGuideByCategory('typography').
 * Includes font families, sizes, weights, prohibited fonts.
 *
 * @returns Array of typography rules
 */
export function getTypographyRules(): StyleGuideRule[] {
  return getStyleGuideByCategory('typography');
}
