/**
 * Document upload module — public surface.
 *
 * The dashboard /upload route uses these to accept files, extract text
 * locally (privilege-safe), persist the document under DOCUMENTS_ROOT,
 * and optionally create a new matter from the document on the fly.
 */

export { parseMultipart, type MultipartFile, type MultipartResult } from './multipart.js';
export { extractText, type ExtractResult } from './extract.js';
export {
  storeDocument,
  listMatterDocuments,
  getDocument,
  readDocumentBytes,
  readDocumentText,
  matterDocDir,
  summariseMatterDocs,
  type StoredDocument,
  type DocumentDirSummary,
} from './store.js';
