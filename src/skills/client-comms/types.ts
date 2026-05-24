/**
 * Client Comms skill — type definitions.
 */

export interface ClientEmailDraft {
  matterId: string;
  toName: string;
  toAddress: string;
  subject: string;
  bodyMarkdown: string;
  /** True until a human has reviewed and approved. */
  unverified: true;
  generatedAt: string;
}
