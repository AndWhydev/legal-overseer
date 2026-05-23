/**
 * SEO Backlinks skill type definitions.
 *
 * Types are split from the rest of the module so the pipeline,
 * submitters, content generator, and report can all import from one
 * place without cycling through index.ts.
 */

import type { SubmissionMethod } from '../../db/repositories/backlinks.js';

export type AnchorStyle = 'branded' | 'keyword' | 'generic' | 'naked_url' | 'long_tail';

/**
 * One submission target — a directory, blog, Q&A platform, etc.
 *
 * The platform's category is intentionally coarse so the classifier
 * and the weekly report can group placements meaningfully.
 */
export interface BacklinkTarget {
  /** Stable identifier — used as dedupe key in the backlinks table. */
  id: string;
  name: string;
  category:
    | 'dev_community'
    | 'general_blog'
    | 'q_and_a'
    | 'directory_au'
    | 'directory_general'
    | 'industry_directory'
    | 'product_launch'
    | 'forum';
  /** Domain authority estimate, 0–100. Snapshotted heuristic, not a paid API. */
  daEstimate: number;
  /** Human-friendly submission URL the manual queue links to. */
  submissionUrl: string;
  /** How the submitter should try to publish. */
  submissionMethod: SubmissionMethod;
  /** Free-text taxonomy for matching against campaign keywords. */
  topics: string[];
  /**
   * Optional geo-locale (e.g. 'AU'). The pipeline gives a small bias
   * to local directories when the target_domain TLD or country matches.
   */
  locale?: string;
  /** Target article word-count range. */
  minWords: number;
  maxWords: number;
  /**
   * If submissionMethod === 'api', the env var name to read for the
   * platform API key. Missing key → fall back to manual_queue.
   */
  apiKeyEnvVar?: string;
  /**
   * Whether the platform permits promotional/marketing content. When
   * false the submitter routes to manual_queue so a human can decide.
   */
  allowsPromotional: boolean;
  notes?: string;
}

/**
 * A generated article ready for submission, plus the anchors that
 * point back at the target page.
 */
export interface GeneratedArticle {
  id: string;
  title: string;
  body: string;
  anchorText: string;
  anchorStyle: AnchorStyle;
  targetUrl: string;
  /** Word count of the body — used to verify the platform's range. */
  wordCount: number;
  /** The platform this article was tailored for. */
  platformId: string;
  /** Free-form summary the report can quote. */
  summary: string;
}

/**
 * Result of one submission attempt.
 */
export interface SubmissionResult {
  success: boolean;
  /**
   * Status to persist on the backlink row. 'live' means the platform
   * confirmed the placement; 'submitted' means we posted but haven't
   * verified; 'planned' means we queued for manual.
   */
  status: 'planned' | 'submitted' | 'live' | 'rejected';
  /** Final URL of the published placement when known. */
  url: string;
  method: SubmissionMethod;
  /** Provider response (status code, JSON body fragment, or note). */
  response?: string;
  error?: string;
}

/**
 * Configuration for a single backlink campaign run.
 */
export interface CampaignConfig {
  targetDomain: string;
  /** Full URL of the target page; defaults to https://<targetDomain>/ */
  targetPage?: string;
  keywords: string[];
  clientName?: string;
  /** Optional campaign id to append to (otherwise we create a new one). */
  campaignId?: string;
  /** Hard ceiling on placements created this run. */
  maxPlacements?: number;
  /** Locale bias (e.g. 'AU') for directory selection. */
  locale?: string;
  /** Industry tag for matching industry_directory targets. */
  industry?: string;
  /**
   * When true, the pipeline plans + records targets and articles but
   * never POSTs to a third-party platform. Used by the npm seo:run
   * script for safe smoke tests.
   */
  dryRun?: boolean;
}

/**
 * Outcome of running one campaign pass.
 */
export interface CampaignRunResult {
  campaignId: string;
  targetDomain: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Targets we considered (after dedupe + filter). */
  targetsConsidered: number;
  articlesGenerated: number;
  submissionsAttempted: number;
  submissionsLive: number;
  submissionsQueuedManual: number;
  errors: string[];
  /** Per-placement detail for the report builder. */
  placements: Array<{
    backlinkId: string;
    platform: string;
    status: SubmissionResult['status'];
    anchorText: string;
    url: string;
  }>;
}

/**
 * The weekly report's shape — what the report generator emits.
 */
export interface WeeklyBacklinkReport {
  reportId: string;
  generatedAt: string;
  windowHours: number;
  targetDomain?: string;
  newLinks: number;
  newLiveLinks: number;
  totalLifetimeLinks: number;
  totalLifetimeLiveLinks: number;
  topAnchorTexts: Array<{
    anchorText: string;
    count: number;
    liveCount: number;
    avgDa: number;
  }>;
  byPlatformCategory: Array<{
    category: string;
    count: number;
    liveCount: number;
  }>;
  recentPlacements: Array<{
    platform: string;
    anchorText: string;
    status: string;
    daEstimate: number;
    createdAt: string;
    url: string;
  }>;
  summary: string;
}
