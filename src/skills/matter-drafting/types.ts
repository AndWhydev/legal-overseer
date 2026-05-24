/**
 * Matter Drafting skill — type definitions.
 */

export type DocumentType =
  | 'letter'
  | 'memo'
  | 'contract'
  | 'court_document'
  | 'affidavit'
  | 'terms_sheet'
  | 'email'
  | 'other';

export interface DraftedDocument {
  matterId: string | null;
  documentType: DocumentType;
  title: string;
  audience: string;
  bodyMarkdown: string;
  /** Placeholders the drafter left for the lawyer to confirm before sending. */
  placeholders: string[];
  /** True until a human has reviewed and approved. */
  unverified: true;
  generatedAt: string;
}
