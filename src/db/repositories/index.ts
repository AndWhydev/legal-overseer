/**
 * Repository index — Legal Overseer.
 *
 * Re-exports every database repository for convenient imports. The
 * legal-domain repos (matters, deadlines) live next to the platform
 * repos (tasks, audit, approvals) inherited from the fork. The review
 * queue, billing log, and immutable legal audit log are owned by
 * src/compliance and accessed there.
 */

export * from './tasks.js';
export * from './audit.js';
export * from './approvals.js';
export * from './projects.js';
export * from './processedEmails.js';
export * from './matters.js';
export * from './deadlines.js';
export * from './lessons.js';
