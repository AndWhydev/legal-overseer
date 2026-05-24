/**
 * Precedents module — public surface.
 *
 * Drafting skill imports `pickBestPrecedent` so it consults the firm
 * library before drafting. The dashboard exposes the search UI at
 * /precedents and the "Add to library" action on approved review-queue
 * rows.
 */

export {
  addPrecedent,
  getPrecedentById,
  listPrecedents,
  searchPrecedents,
  pickBestPrecedent,
  readPrecedentFromDisk,
  type Precedent,
  type AddPrecedentInput,
  type SearchPrecedentsInput,
  type PrecedentMatchInput,
} from './repo.js';
