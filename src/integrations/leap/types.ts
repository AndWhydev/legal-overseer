/**
 * LEAP Legal integration — type definitions.
 *
 * LEAP exposes a REST API (Cloud version) at
 * `https://api.leap.<region>.com` once a firm has signed up to the
 * developer programme and minted OAuth2 credentials. This module
 * implements the minimal set we need: list matters, create a matter,
 * upload a document to a matter.
 *
 * Credentials are optional: when env vars are not set, the
 * `isLeapConfigured()` helper returns false and the integration page
 * shows a "Connect LEAP" call to action.
 */

export interface LeapConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  /** Optional firm id, when LEAP returns multiple. */
  firmId: string | null;
}

export interface LeapMatter {
  id: string;
  matterNumber: string;
  title: string;
  clientName: string;
  status: string;
  responsibleLawyerEmail: string | null;
  /** ISO-8601 — used to dedupe on re-sync. */
  updatedAt: string;
}

export interface LeapSyncResult {
  ok: boolean;
  pulled: number;
  pushed: number;
  errors: string[];
  configured: boolean;
}
