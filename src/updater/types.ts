/**
 * Update-channel types.
 *
 * The runtime polls an HTTPS endpoint controlled by the vendor for a
 * tiny JSON manifest. The product compares its current version to the
 * latest published version and surfaces a banner if newer.
 *
 * The vendor's manifest format is intentionally minimal so it can be
 * static-hosted on any CDN.
 */

export interface UpdateManifest {
  /** Latest version string, e.g. "0.3.2". */
  latest: string;
  /** ISO-8601 date the version was published. */
  published_at: string;
  /** Optional minimum version that's still supported. */
  minimum_supported?: string;
  /** Optional channel-wide notice (security advisory, breaking change). */
  notice?: string;
  /** Optional release notes URL. */
  notes_url?: string;
}

export interface UpdateState {
  /** Local version reported by the runtime. */
  current: string;
  /** Latest version retrieved from the channel (null if check has not run yet). */
  latest: string | null;
  /** True when latest > current. */
  updateAvailable: boolean;
  /** True when the current version is below the channel's minimum_supported. */
  unsupported: boolean;
  /** Last successful check timestamp. */
  lastCheckedAt: string | null;
  /** Last error message, if any. */
  lastError: string | null;
  /** Optional channel notice. */
  notice: string | null;
  /** Optional release notes URL. */
  notesUrl: string | null;
}
