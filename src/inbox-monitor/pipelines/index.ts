/**
 * Pipeline router lookup.
 *
 * Maps an InboxType to its handler. All handlers share the same
 * signature so the poller can call them uniformly.
 */

import type { IncomingEmail, InboxType, PipelineHandler, PipelineResult } from '../types.js';
import { runLegalIntakePipeline } from './legal-intake.js';
import { runCorrespondencePipeline } from './correspondence.js';

const HANDLERS: Record<InboxType, PipelineHandler> = {
  legal_intake: (email: IncomingEmail) => runLegalIntakePipeline(email),
  client: (email: IncomingEmail) => Promise.resolve(runCorrespondencePipeline(email, 'client')),
  court: (email: IncomingEmail) => Promise.resolve(runCorrespondencePipeline(email, 'court')),
  internal: (email: IncomingEmail) => Promise.resolve(runCorrespondencePipeline(email, 'internal')),
};

export function getPipelineHandler(type: InboxType): PipelineHandler {
  return HANDLERS[type];
}

export type { IncomingEmail, PipelineHandler, PipelineResult };
