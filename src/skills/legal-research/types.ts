/**
 * Legal Research skill — type definitions.
 */

export interface Citation {
  /** Free-text citation as it appears in the memo (e.g., "Carlill v Carbolic Smoke Ball Co [1893] 1 QB 256"). */
  text: string;
  /** Best-guess AustLII / source URL when the model could supply one. */
  url: string | null;
  /** Set true only after the citation has been verified against AustLII. */
  verified: boolean;
  /** Verification notes (e.g., "AustLII returned HTTP 200, matched title"). */
  verificationNote: string | null;
}

export interface ResearchMemo {
  matterId: string | null;
  questionPresented: string;
  shortAnswer: string;
  applicableLaw: string;
  analysis: string;
  conclusion: string;
  citations: Citation[];
  /** True until a human has reviewed and approved. */
  unverified: true;
  generatedAt: string;
}
