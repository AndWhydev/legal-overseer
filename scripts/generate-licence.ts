/**
 * generate-licence.ts — Vendor-side licence issuance tool.
 *
 * Run this when you onboard a new firm. Produces a signed token they
 * can paste into LICENCE_KEY or save to /data/licence.key.
 *
 * Usage:
 *   npx tsx scripts/generate-licence.ts \
 *     --firm "Smith & Co Lawyers" \
 *     --domain "smithco.com.au" \
 *     --tier small_firm \
 *     --days 365
 *
 * Optional overrides:
 *   --max-users N        Override the tier default user cap.
 *   --max-matters N      Override the tier default matter cap.
 *   --licence-id ID      Use a specific licence ID (default: random).
 *   --out path/to/file   Write the token to a file as well as stdout.
 *
 * Signing secret:
 *   The token is signed with HMAC-SHA256 using either the
 *   LICENCE_SIGNING_SECRET env var (recommended) or the placeholder
 *   secret baked into src/licence/sign.ts. **For commercial sales,
 *   replace the placeholder before shipping** and keep
 *   LICENCE_SIGNING_SECRET in your password manager.
 */

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { signLicence } from '../src/licence/sign.js';
import { TIER_LIMITS, type LicencePayload, type LicenceTier } from '../src/licence/types.js';

interface CliArgs {
  firm: string;
  domain: string;
  tier: LicenceTier;
  days: number;
  maxUsers?: number;
  maxMatters?: number;
  licenceId?: string;
  out?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    }
  }

  const firm = args.firm;
  const domain = args.domain;
  const tier = (args.tier ?? 'small_firm') as LicenceTier;
  const days = Number.parseInt(args.days ?? '365', 10);

  if (!firm) throw new Error('--firm is required');
  if (!domain) throw new Error('--domain is required');
  if (!['trial', 'small_firm', 'mid_firm', 'enterprise'].includes(tier)) {
    throw new Error(`--tier must be one of trial|small_firm|mid_firm|enterprise (got ${tier})`);
  }
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error('--days must be a positive integer');
  }

  return {
    firm,
    domain,
    tier,
    days,
    maxUsers: args['max-users'] ? Number.parseInt(args['max-users'], 10) : undefined,
    maxMatters: args['max-matters'] ? Number.parseInt(args['max-matters'], 10) : undefined,
    licenceId: args['licence-id'],
    out: args.out,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const defaults = TIER_LIMITS[args.tier];
  const now = new Date();
  const expires = new Date(now.getTime() + args.days * 24 * 60 * 60 * 1000);

  const payload: LicencePayload = {
    v: 1,
    licence_id: args.licenceId ?? randomUUID(),
    tier: args.tier,
    firm_name: args.firm,
    firm_domain: args.domain,
    limits: {
      max_users: args.maxUsers ?? defaults.max_users,
      max_matters: args.maxMatters ?? defaults.max_matters,
    },
    issued_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };

  const token = signLicence(payload);

  process.stdout.write(`# Licence for ${payload.firm_name}\n`);
  process.stdout.write(`# Tier:     ${defaults.label}\n`);
  process.stdout.write(`# Users:    up to ${payload.limits.max_users}\n`);
  process.stdout.write(`# Matters:  up to ${payload.limits.max_matters}\n`);
  process.stdout.write(`# Issued:   ${payload.issued_at}\n`);
  process.stdout.write(`# Expires:  ${payload.expires_at}\n`);
  process.stdout.write(`# ID:       ${payload.licence_id}\n\n`);
  process.stdout.write(`${token}\n`);

  if (args.out) {
    writeFileSync(args.out, `${token}\n`, { mode: 0o600 });
    process.stdout.write(`\n# Written to ${args.out}\n`);
  }
}

try {
  main();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`generate-licence: ${msg}\n`);
  process.exit(1);
}
