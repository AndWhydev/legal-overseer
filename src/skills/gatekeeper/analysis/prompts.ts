/**
 * Visual Compliance Prompt Builder
 *
 * Builds structured prompts for Claude Vision brand compliance analysis.
 * Uses style guide rules to construct detailed requirements for:
 * - Logo position, size, and clear space
 * - Brand color palette with tolerance
 * - Typography requirements and prohibited fonts
 *
 * Prompts request JSON-only responses for reliable parsing.
 */

import type { StyleGuideRule } from '../../../db/repositories/styleGuide.js';

/**
 * Parse rule value JSON safely with fallback
 */
function parseRuleValue<T>(rule: StyleGuideRule | undefined, fallback: T): T {
  if (!rule) return fallback;
  try {
    return JSON.parse(rule.ruleValue) as T;
  } catch {
    return fallback;
  }
}

/**
 * Format logo rules into prompt section
 */
function formatLogoSection(logoRules: StyleGuideRule[]): string {
  const lines: string[] = ['## Logo Requirements'];

  // Position rule (sg-001)
  const positionRule = logoRules.find((r) => r.ruleName === 'position');
  if (positionRule) {
    const value = parseRuleValue<{ allowed_positions: string[] }>(positionRule, {
      allowed_positions: ['top-right', 'bottom-center'],
    });
    lines.push(`- Position: ${value.allowed_positions.join(' OR ')}`);
  } else {
    lines.push('- Position: top-right OR bottom-center');
  }

  // Minimum size rule (sg-002)
  const sizeRule = logoRules.find((r) => r.ruleName === 'min_size');
  if (sizeRule) {
    const value = parseRuleValue<{ min_height_px: number; reference_resolution: string }>(
      sizeRule,
      { min_height_px: 80, reference_resolution: '1080p' }
    );
    lines.push(`- Minimum size: ${value.min_height_px}px height at ${value.reference_resolution} reference`);
  } else {
    lines.push('- Minimum size: 80px height at 1080p reference');
  }

  // Clear space rule (sg-003)
  const clearSpaceRule = logoRules.find((r) => r.ruleName === 'clear_space');
  if (clearSpaceRule) {
    const value = parseRuleValue<{ min_padding_px: number }>(clearSpaceRule, {
      min_padding_px: 20,
    });
    lines.push(`- Clear space: ${value.min_padding_px}px minimum padding around logo`);
  } else {
    lines.push('- Clear space: 20px minimum padding around logo');
  }

  return lines.join('\n');
}

/**
 * Format color rules into prompt section
 */
function formatColorSection(colorRules: StyleGuideRule[]): string {
  const lines: string[] = ['## Brand Colors'];

  // Primary color (sg-020)
  const primaryRule = colorRules.find((r) => r.ruleName === 'primary_color');
  if (primaryRule) {
    const value = parseRuleValue<{ hex: string; name: string; tolerance_percent: number }>(
      primaryRule,
      { hex: '#FF6B6B', name: 'Coral', tolerance_percent: 5 }
    );
    lines.push(`- Primary: ${value.name} ${value.hex} (${value.tolerance_percent}% tolerance)`);
  } else {
    lines.push('- Primary: Coral #FF6B6B (5% tolerance)');
  }

  // Secondary color (sg-021)
  const secondaryRule = colorRules.find((r) => r.ruleName === 'secondary_color');
  if (secondaryRule) {
    const value = parseRuleValue<{ hex: string; name: string; tolerance_percent: number }>(
      secondaryRule,
      { hex: '#4ECDC4', name: 'Teal', tolerance_percent: 5 }
    );
    lines.push(`- Secondary: ${value.name} ${value.hex} (${value.tolerance_percent}% tolerance)`);
  } else {
    lines.push('- Secondary: Teal #4ECDC4 (5% tolerance)');
  }

  // Additional colors
  const otherColors = colorRules.filter(
    (r) => r.ruleName !== 'primary_color' && r.ruleName !== 'secondary_color'
  );
  for (const rule of otherColors) {
    const value = parseRuleValue<{ hex?: string; name?: string }>(rule, {});
    if (value.hex) {
      lines.push(`- ${value.name || rule.ruleName}: ${value.hex}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format typography rules into prompt section
 */
function formatTypographySection(typographyRules: StyleGuideRule[]): string {
  const lines: string[] = ['## Typography'];

  // Headline font (sg-010)
  const headlineRule = typographyRules.find((r) => r.ruleName === 'headline_font');
  if (headlineRule) {
    const value = parseRuleValue<{ family: string; weight: string }>(headlineRule, {
      family: 'Montserrat',
      weight: 'Bold',
    });
    lines.push(`- Headlines: ${value.family} ${value.weight}`);
  } else {
    lines.push('- Headlines: Montserrat Bold');
  }

  // Body font (sg-011)
  const bodyRule = typographyRules.find((r) => r.ruleName === 'body_font');
  if (bodyRule) {
    const value = parseRuleValue<{ family: string; weight: string }>(bodyRule, {
      family: 'Open Sans',
      weight: 'Regular',
    });
    lines.push(`- Body: ${value.family} ${value.weight}`);
  } else {
    lines.push('- Body: Open Sans Regular');
  }

  // Prohibited fonts (sg-012)
  const prohibitedRule = typographyRules.find((r) => r.ruleName === 'prohibited_fonts');
  if (prohibitedRule) {
    const value = parseRuleValue<{ fonts: string[] }>(prohibitedRule, {
      fonts: ['Comic Sans', 'Papyrus', 'Impact'],
    });
    lines.push(`- PROHIBITED: ${value.fonts.join(', ')}`);
  } else {
    lines.push('- PROHIBITED: Comic Sans, Papyrus, Impact');
  }

  return lines.join('\n');
}

/**
 * Build the full brand compliance prompt for Claude Vision.
 *
 * Combines style guide rules into a structured prompt that requests
 * specific JSON response format for reliable parsing.
 *
 * @param logoRules - Logo position, size, and clear space rules
 * @param colorRules - Brand color palette rules
 * @param typographyRules - Font and typography rules
 * @returns Complete prompt string for Claude Vision
 *
 * @example
 * ```typescript
 * const logoRules = getLogoRules();
 * const colorRules = getColorRules();
 * const typographyRules = getTypographyRules();
 * const prompt = buildBrandCompliancePrompt(logoRules, colorRules, typographyRules);
 * // Use with Claude Vision API
 * ```
 */
export function buildBrandCompliancePrompt(
  logoRules: StyleGuideRule[],
  colorRules: StyleGuideRule[],
  typographyRules: StyleGuideRule[]
): string {
  const logoSection = formatLogoSection(logoRules);
  const colorSection = formatColorSection(colorRules);
  const typographySection = formatTypographySection(typographyRules);

  return `Analyze this video frame for CheekyGlo brand compliance.

${logoSection}

${colorSection}

${typographySection}

Analyze the frame carefully and respond with JSON only (no other text):
{
  "logoDetected": boolean,
  "logoPosition": "top-right" | "bottom-center" | "other" | null,
  "logoSizeOk": boolean,
  "colorCompliance": 0-100,
  "colorsFound": ["#hex1", "#hex2"],
  "fontCompliance": 0-100,
  "fontsDetected": ["Font Name"],
  "prohibitedElements": ["element1"],
  "issues": ["issue description"],
  "confidenceScore": 0-100
}

Important:
- logoDetected: true if you see the brand logo anywhere
- logoPosition: where the logo is located, or null if not detected
- logoSizeOk: true if logo appears sufficiently large (estimate based on reference)
- colorCompliance: 0-100 score based on how well colors match brand palette
- colorsFound: list the dominant hex colors you observe
- fontCompliance: 0-100 score based on typography compliance
- fontsDetected: list any fonts you can identify
- prohibitedElements: list any prohibited fonts or elements detected
- issues: list specific compliance issues found
- confidenceScore: your overall confidence in this analysis (0-100)`;
}
