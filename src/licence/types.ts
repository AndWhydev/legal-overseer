/**
 * Licence types.
 *
 * Licences are HMAC-signed tokens issued by the vendor and shipped to
 * the firm's IT team. The runtime verifies the signature on every boot
 * and re-checks the expiry every hour while running.
 *
 * Tier limits drive seat + matter caps inside the product. Tier
 * "trial" is the unsigned default used when no licence is installed;
 * it allows a short window of evaluation before the system enters
 * read-only mode.
 */

export type LicenceTier = 'trial' | 'small_firm' | 'mid_firm' | 'enterprise';

export interface LicencePayload {
  /** Format version. Bump if we ever change the canonical encoding. */
  v: 1;
  /** Random per-licence identifier; printed in /health for support. */
  licence_id: string;
  /** Pricing tier — drives seat and matter caps. */
  tier: LicenceTier;
  /** Firm legal name shown in the dashboard and on the banner. */
  firm_name: string;
  /** Firm primary email domain (allowed user domain). */
  firm_domain: string;
  /** Per-tier hard caps. Set explicitly so a tier rename can't shift them. */
  limits: {
    max_users: number;
    max_matters: number;
  };
  /** ISO-8601 issue date. */
  issued_at: string;
  /** ISO-8601 expiry date. After this date the runtime degrades to read-only. */
  expires_at: string;
}

export interface LicenceStatus {
  /** True when a valid, in-date licence is loaded. */
  valid: boolean;
  /** True when the system should refuse mutating operations. */
  readOnly: boolean;
  /** Human-readable explanation. Shown to the operator on every page. */
  message: string;
  /** Days until expiry. Negative when expired. Null when no licence at all. */
  daysUntilExpiry: number | null;
  /** Loaded payload, if any. */
  payload: LicencePayload | null;
  /** Source the licence was loaded from (env var / file / none). */
  source: 'env' | 'file' | 'none';
}

export const TIER_LIMITS: Record<LicenceTier, { max_users: number; max_matters: number; label: string }> = {
  trial: { max_users: 2, max_matters: 5, label: 'Trial' },
  small_firm: { max_users: 5, max_matters: 50, label: 'Small Firm' },
  mid_firm: { max_users: 20, max_matters: 200, label: 'Mid Firm' },
  enterprise: { max_users: Number.MAX_SAFE_INTEGER, max_matters: Number.MAX_SAFE_INTEGER, label: 'Enterprise' },
};
