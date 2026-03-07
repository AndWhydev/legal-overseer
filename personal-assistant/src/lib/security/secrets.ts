/**
 * Secret Management Helpers
 *
 * Environment variable validation, rotation tracking, and secure access patterns.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/core/logger';

// ─── Required environment variables by category ──────────────────────────────

interface SecretDefinition {
  key: string;
  category: 'core' | 'integration' | 'monitoring' | 'worker';
  required: boolean;
  description: string;
  rotationDays?: number;
}

const SECRET_REGISTRY: SecretDefinition[] = [
  // Core
  { key: 'NEXT_PUBLIC_SUPABASE_URL', category: 'core', required: true, description: 'Supabase project URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', category: 'core', required: true, description: 'Supabase anonymous key' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', category: 'core', required: true, description: 'Supabase service role key', rotationDays: 90 },
  { key: 'ANTHROPIC_API_KEY', category: 'core', required: true, description: 'Anthropic API key', rotationDays: 90 },

  // Integrations
  { key: 'OUTLOOK_CLIENT_ID', category: 'integration', required: false, description: 'Microsoft Graph app ID' },
  { key: 'OUTLOOK_CLIENT_SECRET', category: 'integration', required: false, description: 'Microsoft Graph secret', rotationDays: 180 },
  { key: 'OUTLOOK_TENANT_ID', category: 'integration', required: false, description: 'Azure AD tenant' },
  { key: 'ASANA_ACCESS_TOKEN', category: 'integration', required: false, description: 'Asana personal access token', rotationDays: 365 },
  { key: 'CALENDLY_API_KEY', category: 'integration', required: false, description: 'Calendly API key' },
  { key: 'STRIPE_SECRET_KEY', category: 'integration', required: false, description: 'Stripe secret key', rotationDays: 365 },
  { key: 'WHATSAPP_TOKEN', category: 'integration', required: false, description: 'WhatsApp Business API token', rotationDays: 90 },

  // Monitoring
  { key: 'SENTRY_DSN', category: 'monitoring', required: false, description: 'Sentry error tracking DSN' },

  // Worker
  { key: 'WORKER_CALLBACK_URL', category: 'worker', required: false, description: 'VPS/Fly worker callback URL' },
];

export interface SecretStatus {
  key: string;
  category: string;
  required: boolean;
  present: boolean;
  description: string;
  rotationDays?: number;
}

export interface ValidationResult {
  valid: boolean;
  missing_required: string[];
  missing_optional: string[];
  all_secrets: SecretStatus[];
}

/**
 * Validate that all required environment variables are set.
 */
export function validateEnvironment(): ValidationResult {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const allSecrets: SecretStatus[] = [];

  for (const def of SECRET_REGISTRY) {
    const present = !!process.env[def.key];

    allSecrets.push({
      key: def.key,
      category: def.category,
      required: def.required,
      present,
      description: def.description,
      rotationDays: def.rotationDays,
    });

    if (!present) {
      if (def.required) {
        missingRequired.push(def.key);
      } else {
        missingOptional.push(def.key);
      }
    }
  }

  return {
    valid: missingRequired.length === 0,
    missing_required: missingRequired,
    missing_optional: missingOptional,
    all_secrets: allSecrets,
  };
}

/**
 * Get a required environment variable or throw.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Get an optional environment variable with a default.
 */
export function getEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

// ─── Rotation Tracking ──────────────────────────────────────────────────────

interface RotationRecord {
  id: string;
  secret_key: string;
  rotated_at: string;
  rotated_by: string;
  next_rotation: string;
}

/**
 * Record a secret rotation event.
 */
export async function recordRotation(
  supabase: SupabaseClient,
  secretKey: string,
  rotatedBy: string
): Promise<void> {
  const def = SECRET_REGISTRY.find((d) => d.key === secretKey);
  const rotationDays = def?.rotationDays || 90;
  const nextRotation = new Date();
  nextRotation.setDate(nextRotation.getDate() + rotationDays);

  await supabase.from('secret_rotations').insert({
    secret_key: secretKey,
    rotated_at: new Date().toISOString(),
    rotated_by: rotatedBy,
    next_rotation: nextRotation.toISOString(),
  });
}

/**
 * Get secrets that are due for rotation.
 */
export async function getOverdueRotations(
  supabase: SupabaseClient
): Promise<RotationRecord[]> {
  const { data, error } = await supabase
    .from('secret_rotations')
    .select('*')
    .lt('next_rotation', new Date().toISOString())
    .order('next_rotation', { ascending: true });

  if (error) {
    logger.warn('[secrets] Failed to check rotations:', error.message);
    return [];
  }

  return (data || []) as RotationRecord[];
}
