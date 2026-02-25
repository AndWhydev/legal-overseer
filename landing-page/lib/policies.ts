import fs from 'fs';
import path from 'path';

let cachedPolicies: string | null = null;

export function getPolicies(): string {
  if (cachedPolicies) return cachedPolicies;

  const clientPackPath = path.join(process.cwd(), '.planning', 'CLIENT-PACK.md');
  cachedPolicies = fs.readFileSync(clientPackPath, 'utf-8');
  return cachedPolicies;
}
