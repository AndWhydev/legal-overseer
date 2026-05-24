/**
 * Local version helpers.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let cached: string | null = null;

export function getCurrentVersion(): string {
  if (cached) return cached;
  try {
    const pkgPath = process.env.PACKAGE_JSON_PATH ?? resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    cached = pkg.version ?? '0.0.0';
  } catch {
    cached = '0.0.0';
  }
  return cached;
}

/**
 * Compares two semver-ish strings. Returns negative if a < b, zero
 * if equal, positive if a > b. Handles "1.2.3" and "1.2.3-rc.1".
 */
export function semverCompare(a: string, b: string): number {
  const parse = (s: string) => {
    const [core, pre] = s.split('-', 2);
    const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
    while (nums.length < 3) nums.push(0);
    return { nums, pre: pre ?? '' };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
  }
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1; // release > pre-release
  if (!pb.pre) return -1;
  return pa.pre.localeCompare(pb.pre);
}
