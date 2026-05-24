/**
 * Templates module — public surface.
 *
 * Built-in templates are seeded once at boot via
 * `ensureBuiltInTemplatesLoaded()` (idempotent — re-running on a
 * version bump updates the body and creates a new version row).
 * Firm-added templates live in the same table with source='firm'.
 */

import { BUILTIN_TEMPLATES } from './builtin.js';
import { upsertTemplate } from './repo.js';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('Templates');

export {
  upsertTemplate,
  getTemplateBySlug,
  getTemplateById,
  listTemplates,
  listTemplateVersions,
  setTemplateActive,
  pickBestTemplate,
  type DocumentTemplate,
  type DocumentTemplateVersion,
  type TemplateCategory,
  type TemplateSource,
  type UpsertTemplateInput,
  type TemplateMatchInput,
} from './repo.js';

export function ensureBuiltInTemplatesLoaded(): void {
  let added = 0;
  let updated = 0;
  for (const t of BUILTIN_TEMPLATES) {
    upsertTemplate(t);
    added += 1;
  }
  logger.info(`built-in templates seeded: ${added} loaded (idempotent — duplicates updated as a new version when changed)`);
  void updated;
}
