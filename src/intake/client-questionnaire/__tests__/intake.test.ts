/**
 * Intake intelligence layer — unit tests.
 *
 * Offline only: keyword classification, limitation-period maths,
 * matter-specific urgency, question-set integrity, and the public
 * portal render. No real model/network calls.
 *
 * Run: npm test
 */

// Use an isolated temp database before any repository touches the
// connection singleton.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'intake-test-')), 'test.db');
process.env.INTAKE_FIRM_NAME = 'Test & Co Lawyers';

import test from 'node:test';
import assert from 'node:assert/strict';

import { initializeDatabase } from '../../../db/index.js';
import { classifyByKeywords } from '../classifier.js';
import { getLimitationPeriod } from '../jurisdiction/limitation-periods.js';
import { getRelevantCourt } from '../jurisdiction/court-registry.js';
import { addDays, addMonths, addYears } from '../date-utils.js';
import { SUPPORTED_MATTER_TYPES, getQuestionSet } from '../question-sets/index.js';
import { defamation } from '../question-sets/defamation.js';
import { unfairDismissal } from '../question-sets/unfair-dismissal.js';
import { createIntakeSession } from '../repo.js';
import { handleIntakePortalRoute } from '../portal.js';
import type { MatterType } from '../types.js';

initializeDatabase();

// ── Task verification 4: classifier identifies matter types ──────────
test('classifier identifies matter types from plain English phrases', () => {
  const cases: Array<[string, MatterType]> = [
    ['I was fired last week', 'unfair-dismissal'],
    ["My tenant hasn't paid rent", 'residential-tenancy'],
    ['Someone posted lies about me on Facebook', 'defamation'],
    ["I'm buying a house in Brisbane", 'conveyancing-purchase'],
    ['My boss injured me at work', 'workers-compensation'],
    ['I need help with my will', 'will-and-estate'],
    ['My business partner ripped me off', 'commercial-dispute'],
  ];
  for (const [phrase, expected] of cases) {
    const result = classifyByKeywords(phrase);
    assert.equal(result.matterType, expected, `"${phrase}" → expected ${expected}, got ${result.matterType}`);
  }
});

// ── Task verification 5: limitation period calculations ──────────────
test('unfair dismissal 15 days ago → 6 days remaining, urgent', () => {
  const trigger = addDays(new Date(), -15);
  const lp = getLimitationPeriod('unfair-dismissal', 'NSW', trigger);
  assert.equal(lp.daysRemaining, 6);
  assert.equal(lp.urgent, true);
  assert.equal(lp.critical, false);
});

test('defamation 11 months ago in NSW → ~30 days remaining', () => {
  const trigger = addMonths(new Date(), -11);
  const lp = getLimitationPeriod('defamation', 'NSW', trigger);
  // 1 year from publication; ~30 days left (month-length dependent).
  assert.ok(lp.daysRemaining >= 27 && lp.daysRemaining <= 33, `daysRemaining=${lp.daysRemaining}`);
});

test('defamation urgencyCheck flags urgent within 30 days of expiry', () => {
  // Publication 11 months and 10 days ago → ~20 days remaining.
  const published = addDays(addMonths(new Date(), -11), -10);
  const result = defamation.urgencyCheck({ publication_date: published.toISOString() });
  assert.equal(result.urgent, true);
  assert.ok((result.daysRemaining ?? 99) <= 30);
});

test('will and estate death 13 months ago in NSW → expired', () => {
  const trigger = addMonths(new Date(), -13);
  const lp = getLimitationPeriod('will-and-estate', 'NSW', trigger);
  // NSW family provision window is 12 months from death → expired.
  assert.ok(lp.daysRemaining < 0, `expected expired, daysRemaining=${lp.daysRemaining}`);
  assert.equal(lp.urgent, true);
});

test('debt recovery acknowledgement 7 years ago → expired', () => {
  const trigger = addYears(new Date(), -7);
  const lp = getLimitationPeriod('debt-recovery', 'NSW', trigger);
  assert.ok(lp.daysRemaining < 0, `expected expired, daysRemaining=${lp.daysRemaining}`);
  assert.equal(lp.urgent, true);
});

test('unfair dismissal urgencyCheck: 15 days ago → 6 days, urgent', () => {
  const dismissed = addDays(new Date(), -15);
  const result = unfairDismissal.urgencyCheck({ dismissal_date: dismissed.toISOString() });
  assert.equal(result.urgent, true);
  assert.equal(result.daysRemaining, 6);
});

// ── Question-set integrity ───────────────────────────────────────────
test('all 15 practice areas have a question set with required fields', () => {
  assert.equal(SUPPORTED_MATTER_TYPES.length, 15);
  for (const type of SUPPORTED_MATTER_TYPES) {
    const set = getQuestionSet(type);
    assert.ok(set, `missing question set for ${type}`);
    assert.equal(set!.matterType, type);
    assert.ok(set!.questions.length >= 9, `${type} has too few questions`);
    assert.ok(typeof set!.openingMessage === 'string' && set!.openingMessage.length > 0);
    for (const q of set!.questions) {
      assert.ok(q.id && q.text && q.legalSignificance, `${type} question missing fields`);
    }
    // Every set must produce an UrgencyResult without throwing.
    const urgency = set!.urgencyCheck({});
    assert.equal(typeof urgency.urgent, 'boolean');
  }
});

// ── Court registry ───────────────────────────────────────────────────
test('court registry maps key matter types', () => {
  assert.match(getRelevantCourt('unfair-dismissal', 'NSW'), /Fair Work Commission/);
  assert.match(getRelevantCourt('residential-tenancy', 'NSW'), /NCAT/);
  assert.match(getRelevantCourt('residential-tenancy', 'VIC'), /VCAT/);
  assert.match(getRelevantCourt('family-law-property', 'WA'), /Family Court of Western Australia/);
  assert.match(getRelevantCourt('debt-recovery', 'NSW', 50_000), /Local Court/);
  assert.match(getRelevantCourt('debt-recovery', 'NSW', 500_000), /District Court/);
  assert.match(getRelevantCourt('debt-recovery', 'NSW', 900_000), /Supreme Court/);
});

// ── Task verification 6: portal renders ──────────────────────────────
test('intake web portal renders the first question for a session', async () => {
  const session = createIntakeSession({
    clientEmail: 'client@example.com',
    clientName: 'Jane Client',
    firmSlug: 'test',
    matterType: 'unfair-dismissal',
  });

  let status = 0;
  let body = '';
  const res = {
    writeHead(s: number) {
      status = s;
      return res;
    },
    end(b?: string) {
      body = b ?? '';
      return res;
    },
  } as unknown as import('node:http').ServerResponse;

  const handled = await handleIntakePortalRoute(
    { method: 'GET' } as import('node:http').IncomingMessage,
    res,
    `/intake/${session.id}`,
  );

  assert.equal(handled, true);
  assert.equal(status, 200);
  assert.match(body, /Test &amp; Co Lawyers/);
  assert.match(body, /dismissed|employment was ending/);
  assert.match(body, /Question 1 of/);
});
