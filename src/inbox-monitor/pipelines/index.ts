/**
 * Pipeline router lookup.
 *
 * Maps an InboxType to its handler. The handler signature is the same
 * for all five pipelines so the poller can call them uniformly.
 */

import type { IncomingEmail, InboxType, PipelineHandler, PipelineResult } from '../types.js';
import { runSoftwarePipeline } from './software.js';
import { runSEOPipeline } from './seo.js';
import { runGenericPipeline } from './generic.js';

const HANDLERS: Record<InboxType, PipelineHandler> = {
  software: (email: IncomingEmail) => runSoftwarePipeline(email),
  seo: (email: IncomingEmail) => runSEOPipeline(email),
  design: (email: IncomingEmail) => Promise.resolve(runGenericPipeline(email, 'design')),
  content: (email: IncomingEmail) => Promise.resolve(runGenericPipeline(email, 'content')),
  ops: (email: IncomingEmail) => Promise.resolve(runGenericPipeline(email, 'ops')),
};

export function getPipelineHandler(type: InboxType): PipelineHandler {
  return HANDLERS[type];
}

export type { IncomingEmail, PipelineHandler, PipelineResult };
