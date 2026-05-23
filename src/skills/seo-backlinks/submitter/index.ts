/**
 * Submitter — publishes (or queues) one (target, article) pair.
 *
 * Submission strategy is driven by the target's `submissionMethod`:
 *
 *   api          → POST to the platform's public API. Currently
 *                  implements DEV Community (dev.to) since their API is
 *                  open and personal-token-based. Other API targets
 *                  fall back to manual_queue when no key is configured.
 *   web_form     → We don't drive a browser here; we record the
 *                  payload + submission URL so a human can paste it in,
 *                  AND attempt a HEAD on the target page so the row's
 *                  url field at least resolves to something useful.
 *                  Marked 'submitted' rather than 'live'.
 *   rss          → Adds the platform's RSS endpoint to the response
 *                  note so the operator's blog publisher can ingest it.
 *   manual_queue → No network call; status is 'planned' and the
 *                  operator picks it up from the report's "manual"
 *                  section.
 *
 * Hard rule: when the target says `allowsPromotional: false`, we
 * downgrade to manual_queue regardless of the method.
 */

import { createSafeLogger } from '../../../governance/index.js';
import type { BacklinkTarget, GeneratedArticle, SubmissionResult } from '../types.js';

const logger = createSafeLogger('SEOBacklinks.Submitter');

interface SubmitArgs {
  target: BacklinkTarget;
  article: GeneratedArticle;
  /** When true, never make an outbound HTTP request — record only. */
  dryRun?: boolean;
}

/**
 * dev.to article submission. They accept a personal API key in the
 * `api-key` header and return the published URL on success.
 *
 * Docs: https://developers.forem.com/api/v1#tag/articles
 */
async function submitDevTo(args: SubmitArgs): Promise<SubmissionResult> {
  const { target, article, dryRun } = args;
  const apiKey = target.apiKeyEnvVar ? process.env[target.apiKeyEnvVar] : undefined;

  if (!apiKey) {
    return {
      success: false,
      status: 'planned',
      url: target.submissionUrl,
      method: 'manual_queue',
      response: `No ${target.apiKeyEnvVar} in env — queued for manual submission.`,
    };
  }

  if (dryRun) {
    return {
      success: true,
      status: 'planned',
      url: target.submissionUrl,
      method: 'api',
      response: 'dry_run: would POST to https://dev.to/api/articles',
    };
  }

  try {
    const res = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        article: {
          title: article.title,
          body_markdown: article.body,
          published: true,
          canonical_url: article.targetUrl,
          tags: [],
        },
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      return {
        success: false,
        status: 'rejected',
        url: target.submissionUrl,
        method: 'api',
        response: `HTTP ${res.status}: ${text.slice(0, 400)}`,
        error: `dev.to returned ${res.status}`,
      };
    }

    let parsed: { url?: string; canonical_url?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // Body wasn't JSON — keep the raw response for diagnostics.
    }

    const publishedUrl = parsed.url ?? parsed.canonical_url ?? target.submissionUrl;
    return {
      success: true,
      status: 'live',
      url: publishedUrl,
      method: 'api',
      response: `Published to dev.to (HTTP ${res.status})`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      status: 'rejected',
      url: target.submissionUrl,
      method: 'api',
      response: `fetch error: ${msg}`,
      error: msg,
    };
  }
}

/**
 * Web-form submission attempts a HEAD against the submission URL just
 * to confirm the page is reachable, then records as 'submitted' for
 * the operator to follow up. We do NOT auto-fill third-party forms
 * (TOS risk, captcha, and reliability all argue against it).
 */
async function submitWebForm(args: SubmitArgs): Promise<SubmissionResult> {
  const { target, dryRun } = args;
  if (dryRun) {
    return {
      success: true,
      status: 'submitted',
      url: target.submissionUrl,
      method: 'web_form',
      response: 'dry_run: web_form submission queued',
    };
  }

  try {
    const res = await fetch(target.submissionUrl, { method: 'HEAD' });
    return {
      success: true,
      status: 'submitted',
      url: target.submissionUrl,
      method: 'web_form',
      response: `Submission page reachable (HTTP ${res.status}); article prepared for human paste.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      status: 'planned',
      url: target.submissionUrl,
      method: 'manual_queue',
      response: `HEAD failed: ${msg}; downgraded to manual.`,
      error: msg,
    };
  }
}

function submitManual(target: BacklinkTarget, reason: string): SubmissionResult {
  return {
    success: true,
    status: 'planned',
    url: target.submissionUrl,
    method: 'manual_queue',
    response: reason,
  };
}

/**
 * Pick the right submission strategy for one (target, article).
 *
 * Strategy decisions live here so the pipeline stays a thin
 * orchestrator. Adding a new platform is one entry in
 * BACKLINK_TARGETS + (optionally) one new submitter function below.
 */
export async function submitArticle(args: SubmitArgs): Promise<SubmissionResult> {
  const { target, article, dryRun } = args;

  // Anti-spam guard.
  if (!target.allowsPromotional) {
    return submitManual(
      target,
      `${target.name} doesn't allow promotional content — human review required before posting.`,
    );
  }

  // Word-range guard. The content generator targets the average, but
  // if it overshoots we'd rather queue than publish out-of-spec.
  if (article.wordCount < target.minWords || article.wordCount > target.maxWords * 1.4) {
    return submitManual(
      target,
      `Article length ${article.wordCount} outside ${target.name}'s ${target.minWords}–${target.maxWords} range.`,
    );
  }

  switch (target.submissionMethod) {
    case 'api':
      if (target.id === 'dev.to') return submitDevTo({ target, article, dryRun });
      // Other API targets aren't implemented; route to manual queue
      // with a clear note so the operator (and future code) sees why.
      return submitManual(
        target,
        `API submission for ${target.name} not yet implemented — queued.`,
      );
    case 'web_form':
      return submitWebForm({ target, article, dryRun });
    case 'rss':
      return submitManual(target, `RSS endpoint queued (${target.submissionUrl}).`);
    case 'manual_queue':
    default:
      return submitManual(target, 'Platform requires human submission.');
  }
}

/**
 * Batch-submit. Sequential to avoid hammering any one host and to make
 * the logs easy to follow. Errors per-item are caught and surfaced
 * as a failed SubmissionResult so the pipeline never aborts halfway.
 */
export async function submitAll(
  pairs: Array<{ target: BacklinkTarget; article: GeneratedArticle }>,
  dryRun = false,
): Promise<Array<SubmissionResult & { targetId: string; articleId: string }>> {
  const out: Array<SubmissionResult & { targetId: string; articleId: string }> = [];
  for (const { target, article } of pairs) {
    try {
      const res = await submitArticle({ target, article, dryRun });
      out.push({ ...res, targetId: target.id, articleId: article.id });
      logger.info(`Submitted to ${target.id}: ${res.status} (method=${res.method})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Submission threw for ${target.id}: ${msg}`);
      out.push({
        success: false,
        status: 'rejected',
        url: target.submissionUrl,
        method: 'manual_queue',
        response: `unhandled error: ${msg}`,
        error: msg,
        targetId: target.id,
        articleId: article.id,
      });
    }
  }
  return out;
}
