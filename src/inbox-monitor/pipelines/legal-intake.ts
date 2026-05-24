/**
 * LEGAL_EMAIL inbox pipeline.
 *
 * Thin wrapper around src/legal-intake which does the actual work
 * (matter creation, attachment staging, lawyer notification). Kept as
 * a separate file so the pipelines registry mirrors the pattern used
 * by the other inbox slots.
 */

import { runLegalIntake } from '../../legal-intake/index.js';
import type { IncomingEmail, PipelineResult } from '../types.js';

export function runLegalIntakePipeline(email: IncomingEmail): Promise<PipelineResult> {
  return runLegalIntake(email);
}
