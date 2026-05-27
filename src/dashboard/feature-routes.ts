/**
 * Dashboard routes for all section 1-9 features.
 *
 * Returns true if the route was handled, false to let the existing
 * router try to match. Kept in a single file so we don't have to
 * rewrite the existing server.ts.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Session } from '../users/session.js';
import { escapeHtml } from './render.js';
import { brandingStyle, getBranding } from '../branding/index.js';

// Intelligence
import { predictMatterOutcome, getLatestOutcomePrediction, acknowledgeOutcomePrediction } from '../intelligence/outcome-predictor.js';
import { generateMatterStrategy, getApprovedStrategy, listMatterStrategies, approveStrategy, rejectStrategy } from '../intelligence/strategy-generator.js';
import { generateDepositionPrep, listMatterDepositionPreps } from '../intelligence/deposition-prep.js';
import { createNegotiation, addContractVersion, listMatterNegotiations, listVersions as listContractVersions } from '../intelligence/negotiation-tracker.js';
import { listAllBenchmarks, getFirmFeeStats, compareMatterAgainstBenchmark } from '../intelligence/fee-benchmarking.js';
import { compareJurisdictions, listMatterJurisdictionComparisons } from '../intelligence/jurisdiction-compare.js';
import { explainDocument, listMatterExplainers } from '../intelligence/plain-english.js';
import { listReports as listMarketReports, generateMarketReport, getReport as getMarketReport } from '../intelligence/market-intelligence.js';
import { listCompetitors, addCompetitor, generateCompetitorReport, listReports as listCompetitorReports } from '../intelligence/competitor-analysis.js';

// Documents & Knowledge
import { listVersions as listDocVersions, rollbackToVersion, summariseVersions } from '../documents/version-control.js';
import { classifyDocument, getDocumentClassification, correctClassification } from '../documents/classifier.js';
import { compareTexts, listRedlineComparisons, getRedlineComparison } from '../documents/redline.js';
import { smartSearch, rebuildIndex, listSearchHistory } from '../search/smart-search.js';
import { createKnowledgeEntry, searchKnowledge, getKnowledgeEntry, updateKnowledgeEntry, listKnowledgeVersions } from '../knowledge/knowledge-base.js';
import { addClause, searchClauses, listClauseTypes, getClause, updateClause } from '../knowledge/clause-library.js';

// Clients & Matters
import { createClient as createClientRecord, listClients as listClientRecords, getClient as getClientRecord, updateClient } from '../clients/repo.js';
import { computeAllHealthScores, getLatestHealthScore, listHealthScoreHistory, computeClientHealthScore } from '../clients/health-score.js';
import { startClientOnboarding, listOnboardingsByStatus, approveEngagementLetter, markIdentityVerified } from '../onboarding/client-onboarding.js';
import { createSignatureEnvelope, sendEnvelope, listPendingEnvelopes, getEnvelope, listEnvelopeSigners, addSigner, recordSignature, declineSignature, getSignerByToken } from '../documents/esignature.js';
import { scheduleSurvey, getSurveyByToken, submitResponse, getSatisfactionStats } from '../clients/satisfaction.js';
import { getReferralStats } from '../clients/referrals.js';
import { setMatterBudget, getMatterBudget, recordDisbursement, listMatterDisbursements, getBudgetStatus } from '../matters/budgeting.js';

// Compliance
import { screenClient, listFlaggedScreenings, reviewScreening, generateMonthlyAmlReport } from '../compliance/aml.js';
import { computePIRisk, getLatestRiskAssessment, listHighRiskMatters } from '../compliance/pi-risk.js';
import { listUpcomingEvents as listRegulatoryEvents, markEventComplete, createRegulatoryEvent } from '../compliance/regulatory-calendar.js';
import { listOverdueReviews, recordReview, ensureSchedule } from '../compliance/file-review.js';
import { checkEngagementLetter, listChecks as listCostsChecks, nearMissReport } from '../compliance/costs-disclosure.js';
import { importBankCsv, generateReconciliation, listReconciliations, listUnmatchedTransactions, listMatterTrustLedger, signOffReconciliation } from '../compliance/trust-reconciliation.js';

// Communication & Collaboration
import { postMessage, listMatterChat, completeActionItem, listActionItemsForUser } from '../collaboration/matter-chat.js';
import { createExternalBrief, getBrief, getBriefByToken, listAccessLog, logAccess, canCounselSeeDocument, listCounselUploads, revokeBrief } from '../collaboration/external-counsel.js';
import { upsertCalendarConfig, buildIcsFeed, getConfig as getCalConfig, getConfigByIcsToken } from '../integrations/calendar-sync.js';
import { listFileNotes, promoteActionItemsToChat } from '../collaboration/file-notes.js';
import { draftSms, sendSms, listMatterSms, recordOptOut, handleTwilioWebhook } from '../communication/sms.js';

// Analytics
import { profitabilityRows, profitabilityTotals, profitabilityByDimension, revenueTrendByMonth } from '../analytics/profitability.js';
import { metricsForAllLawyers, metricsForLawyer, firmBenchmarks } from '../analytics/lawyer-performance.js';
import { matterPipelines, forecastWindow, forecastByMonth, mattersAtRiskOfDelay } from '../analytics/pipeline.js';

// Integrations
import { saveConfig as saveXeroConfig, isConfigured as isXeroConfigured, pullPayments } from '../integrations/xero/index.js';
import { saveDocuSignConfig, isDocuSignConfigured, handleDocuSignWebhook } from '../integrations/docusign/index.js';
import { saveTeamsConfig, isTeamsConfigured, listRecentTeamsNotifications } from '../integrations/teams/index.js';
import { fileEmailToMatter, createMatterFromOutlook, getMatterSummaryForAddin, createTaskFromEmail, createDeadlineFromEmail } from '../integrations/outlook/index.js';
import { subscribe as subscribeWebhook, unsubscribe as unsubscribeWebhook, listSubscriptions as listWebhookSubs, handleIncomingWebhook } from '../integrations/zapier/index.js';
import { runBackup, verifyMostRecentBackup, listBackupRuns } from '../backup/index.js';

// Paralegal Replacement
import { upsertLawyerEmailConfig, getLawyerEmailConfig, verifyLawyerSmtp, queueOutboundEmail, sendOutboundEmail, listOutboundEmails } from '../communication/outbound-email.js';
import { createDocumentRequest, listMatterRequests, listAllOpenRequests, markCompleted, dispatchReminders as dispatchDocReminders } from '../communication/document-chasing.js';
import { logCallFromAudio, draftFollowUpFromCallNote, listMatterCallNotes } from '../communication/call-logging.js';
import { draftInvoice, getInvoice, listMatterInvoices, markInvoiceSent, recordPayment, generateMonthlyInvoices } from '../billing/invoice-generator.js';
import { listOverdueInvoices, dispatchReminders as dispatchPaymentReminders, draftPaymentReceipt, ageingReport } from '../billing/payment-chasing.js';

// Enterprise
import { startSsoFlow, handleSsoCallback, saveSsoConfig, isSsoEnabled, getSsoConfig } from '../auth/sso.js';
import { createPracticeGroup, listPracticeGroups, assignUserToGroup, removeUserFromGroup, assignMatterToGroup, listUserGroups, listMatterGroups, listMattersForUser } from '../auth/practice-groups.js';
import { enableSupervision, disableSupervision, listPendingSecondaryReviews, supervisorApprove, supervisorEdit, supervisorReject, juniorApprove, getSupervision } from '../matters/supervision.js';
import { parseImportCsv, previewImport, commitImport, listImportRuns, type ImportSource } from '../matters/bulk-import.js';
import { updateBranding } from '../branding/index.js';
import { createApiKey, listApiKeys, revokeApiKey } from '../api/keys.js';
import { handleApiRequest } from '../api/rest.js';
import { createOffice, listOffices, assignUserToOffice, assignMatterToOffice, officeStats } from '../admin/offices.js';
import { listRecentEvents as listMonitoringEvents, currentHealthStatus } from '../monitoring/index.js';

import { appendLegalAudit } from '../compliance/audit.js';
import { getMatterById, listMatters } from '../db/repositories/matters.js';

// Client intake intelligence layer
import {
  listIntakeSessions,
  getIntakeSession,
  getBriefByMatter,
  nextQuestion as nextIntakeQuestion,
} from '../intake/client-questionnaire/index.js';
import type { IntakeSession, ClientBrief } from '../intake/client-questionnaire/index.js';

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}
function text(res: ServerResponse, status: number, body: string, contentType = 'text/plain'): void {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
}
function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to });
  res.end();
}

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function shell(title: string, body: string): string {
  const b = getBranding();
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} — ${escapeHtml(b.firm_name)}</title>${brandingStyle()}
<style>body{font:14px/1.5 -apple-system, BlinkMacSystemFont, sans-serif;background:#0f1115;color:#e6e9ee;margin:0;padding:24px;max-width:1200px;margin:0 auto}h1,h2,h3{color:var(--brand-primary)}table{width:100%;border-collapse:collapse;background:#181b22;border-radius:6px;overflow:hidden;margin:16px 0}th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #2a2f3a}th{background:#1f232b;color:#8a93a4;text-transform:uppercase;font-size:11px}a{color:var(--brand-primary)}.btn{background:var(--brand-primary);color:#0f1115;padding:6px 12px;border-radius:4px;border:0;text-decoration:none;display:inline-block;cursor:pointer}.flash-ok{background:#1f4a2f;padding:8px 12px;border-radius:4px}.flash-err{background:#5a1f1f;padding:8px 12px;border-radius:4px}pre{background:#181b22;padding:12px;border-radius:6px;overflow:auto}.card{background:#181b22;padding:16px;border-radius:6px;margin:12px 0}form{margin:12px 0}label{display:block;margin:8px 0 4px}input,textarea,select{width:100%;padding:8px;background:#0f1115;border:1px solid #2a2f3a;color:#e6e9ee;border-radius:4px;box-sizing:border-box}textarea{min-height:120px;font-family:ui-monospace,monospace}.muted{color:#8a93a4}ul,ol{margin:8px 0}</style>
</head><body>${body}</body></html>`;
}

function nav(): string {
  return `<nav style="margin-bottom:16px"><a href="/">Matters</a> · <a href="/intake">Intake</a> · <a href="/review">Review</a> · <a href="/calendar">Calendar</a> · <a href="/billing">Billing</a> · <a href="/search">Search</a> · <a href="/knowledge">KB</a> · <a href="/clauses">Clauses</a> · <a href="/redline">Redline</a> · <a href="/analytics/profitability">Analytics</a> · <a href="/compliance/aml">AML</a> · <a href="/compliance/regulatory">Regulatory</a> · <a href="/admin/integrations">Integrations</a></nav>`;
}

const INTAKE_TYPE_LABEL = (t: string): string => t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function timeSince(date: Date): string {
  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function intakeProgress(session: IntakeSession): string {
  if (session.matterType === 'unknown') return '—';
  const step = nextIntakeQuestion(session);
  if (!step) return 'complete';
  return `${step.answered}/${step.total}`;
}

function renderIntakeDashboard(): string {
  const active = listIntakeSessions('in-progress');
  const complete = listIntakeSessions('complete');
  const abandoned = listIntakeSessions('abandoned');
  const escalated = listIntakeSessions('escalated');

  const urgentBadge = (s: IntakeSession) =>
    s.urgencyFlag ? `<span style="background:#5a1f1f;padding:2px 6px;border-radius:4px">URGENT</span>` : '';

  const activeRows = active.length
    ? active
        .map(
          (s) => `<tr>
        <td>${escapeHtml(s.clientName || s.clientEmail)}</td>
        <td>${escapeHtml(INTAKE_TYPE_LABEL(s.matterType))}</td>
        <td>${intakeProgress(s)}</td>
        <td>${timeSince(s.startedAt)}</td>
        <td>${urgentBadge(s)} ${s.urgencyReason ? escapeHtml(s.urgencyReason) : ''}</td>
        <td><a href="/intake/${escapeHtml(s.id)}" target="_blank">portal</a></td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="6" class="muted">No active intakes.</td></tr>`;

  const completeRows = complete.length
    ? complete
        .map(
          (s) => `<tr>
        <td>${escapeHtml(s.clientName || s.clientEmail)}</td>
        <td>${escapeHtml(INTAKE_TYPE_LABEL(s.matterType))}</td>
        <td>${escapeHtml(s.state)}</td>
        <td>${urgentBadge(s)}</td>
        <td>${s.matterId ? `<a href="/matter/${escapeHtml(s.matterId)}/intake">open brief</a>` : 'no brief'}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="5" class="muted">No completed intakes awaiting review.</td></tr>`;

  const followUpRows = [...abandoned, ...escalated].length
    ? [...abandoned, ...escalated]
        .map(
          (s) => `<tr>
        <td>${escapeHtml(s.clientName || s.clientEmail)}</td>
        <td>${escapeHtml(INTAKE_TYPE_LABEL(s.matterType))}</td>
        <td>${escapeHtml(s.status)}</td>
        <td>${timeSince(s.startedAt)}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="4" class="muted">Nothing needing follow-up.</td></tr>`;

  return `<h1>Client intake</h1>
  <h2>Active sessions</h2>
  <table><tr><th>Client</th><th>Matter type</th><th>Answered</th><th>Started</th><th>Urgency</th><th></th></tr>${activeRows}</table>
  <h2>Completed — brief ready for review</h2>
  <table><tr><th>Client</th><th>Matter type</th><th>State</th><th>Urgency</th><th></th></tr>${completeRows}</table>
  <h2>Needs human follow-up (abandoned / escalated)</h2>
  <table><tr><th>Client</th><th>Matter type</th><th>Status</th><th>Age</th></tr>${followUpRows}</table>`;
}

function renderMatterIntakeView(matterId: string): string | null {
  const matter = getMatterById(matterId);
  if (!matter) return null;
  const brief: ClientBrief | null = getBriefByMatter(matterId);
  if (!brief) {
    return `<h1>Intake — ${escapeHtml(matter.title)}</h1><p class="muted">No intake brief is linked to this matter.</p><p><a href="/matter/${escapeHtml(matterId)}">Back to matter</a></p>`;
  }
  const session = getIntakeSession(brief.sessionId);

  const transcript = (session ? brief.fullTranscript : brief.fullTranscript)
    .map((t) => `<div class="card"><b>${escapeHtml(t.question)}</b><br>${escapeHtml(t.answer)}</div>`)
    .join('');

  const cases = brief.relevantCases.length
    ? brief.relevantCases
        .map((c) => `<li><b>${escapeHtml(c.citation)}</b> (${escapeHtml(c.court)}) — ${escapeHtml(c.summary)}</li>`)
        .join('')
    : '<li class="muted">None surfaced.</li>';
  const legislation = brief.applicableLegislation.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
  const steps = brief.recommendedFirstSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  const risks = brief.riskFlags.length
    ? brief.riskFlags.map((r) => `<li>${escapeHtml(r)}</li>`).join('')
    : '<li class="muted">None.</li>';

  const briefHtml = `<h2>Generated brief</h2>
    ${brief.urgencyFlag ? `<div class="flash-err"><b>URGENT:</b> ${escapeHtml(brief.urgencyReason ?? '')}${brief.daysUntilLimitationPeriod !== undefined ? ` — ${brief.daysUntilLimitationPeriod} day(s) remaining` : ''}</div>` : ''}
    <div class="card"><b>Limitation period:</b> ${escapeHtml(brief.limitationPeriod)}</div>
    <div class="card"><b>Estimated cost:</b> ${escapeHtml(brief.estimatedCostRange)}</div>
    <h3>Fact summary</h3><div class="card" style="white-space:pre-wrap">${escapeHtml(brief.factSummary)}</div>
    <h3>Applicable legislation</h3><ul>${legislation}</ul>
    <h3>Relevant authority</h3><ul>${cases}</ul>
    <h3>Recommended first steps</h3><ol>${steps}</ol>
    <h3>Risk flags</h3><ul>${risks}</ul>`;

  return `<h1>Intake — ${escapeHtml(matter.title)} <span class="muted">(${escapeHtml(matter.matter_number)})</span></h1>
  <p><a href="/matter/${escapeHtml(matterId)}">← Back to matter</a></p>
  <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">
    <div style="flex:1;min-width:320px"><h2>Intake transcript</h2>${transcript}</div>
    <div style="flex:1;min-width:320px">${briefHtml}</div>
  </div>`;
}

export async function handleFeatureRoute(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  session: Session,
): Promise<boolean> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://x');
  const acting = session.user.email;

  // ============================================================
  // REST API
  // ============================================================
  if (path.startsWith('/api/v1/') || path === '/api/docs' || path === '/api/docs/explorer') {
    return await handleApiRequest(req, res);
  }

  // ============================================================
  // SECTION 1 — Intelligence
  // ============================================================

  let m = path.match(/^\/api\/matter\/([0-9a-f-]+)\/predict-outcome$/i);
  if (m && method === 'POST') {
    try {
      const result = await predictMatterOutcome({ matterId: m[1], acting });
      json(res, 200, result);
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/outcome$/i);
  if (m && method === 'GET') {
    const p = getLatestOutcomePrediction(m[1]);
    if (!p) { html(res, 200, shell('Outcome', nav() + '<h1>Outcome analysis</h1><p>None yet — generate one via the API.</p>')); return true; }
    const ack = url.searchParams.get('ack');
    if (ack === '1') acknowledgeOutcomePrediction(p.id, acting);
    const body = `<h1>Outcome analysis (matter ${escapeHtml(p.matter_id)})</h1><div class="card"><b>Risk:</b> ${p.litigation_risk_score ?? '?'}/10 · <b>Win:</b> ${(p.win_probability ?? 0) * 100}% · <b>Settle:</b> ${(p.settle_probability ?? 0) * 100}%</div><pre>${escapeHtml(p.analysis_markdown)}</pre>${p.acknowledged_by ? `<p>Acknowledged by ${escapeHtml(p.acknowledged_by)} at ${escapeHtml(p.acknowledged_at ?? '')}</p>` : `<form method="get"><input type="hidden" name="ack" value="1"><p><label><input type="checkbox" required> I understand this is AI analysis, not legal advice</label></p><button class="btn" type="submit">Acknowledge</button></form>`}`;
    html(res, 200, shell('Outcome analysis', nav() + body));
    return true;
  }

  m = path.match(/^\/matter\/([0-9a-f-]+)\/strategy$/i);
  if (m && method === 'GET') {
    const strategies = listMatterStrategies(m[1]);
    const approved = getApprovedStrategy(m[1]);
    const body = `<h1>Matter strategy</h1>${approved ? `<div class="card flash-ok">Active strategy v${approved.version} (approved ${escapeHtml(approved.approved_at ?? '')})</div><pre>${escapeHtml(approved.body_markdown)}</pre>` : '<p>No approved strategy yet.</p>'}<h2>All versions</h2><table><tr><th>Version</th><th>Status</th><th>Created</th></tr>${strategies.map((s) => `<tr><td>v${s.version}</td><td>${s.status}</td><td>${escapeHtml(s.created_at)}</td></tr>`).join('')}</table><form method="post" action="/matter/${m[1]}/strategy/generate"><button class="btn" type="submit">Generate new strategy draft</button></form>`;
    html(res, 200, shell('Strategy', nav() + body));
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/strategy\/generate$/i);
  if (m && method === 'POST') {
    try {
      await generateMatterStrategy({ matterId: m[1], acting });
    } catch (err) { /* swallow */ }
    redirect(res, `/matter/${m[1]}/strategy`);
    return true;
  }
  m = path.match(/^\/strategy\/([0-9a-f-]+)\/(approve|reject)$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    const note = body.get('note') ?? undefined;
    try {
      if (m[2] === 'approve') approveStrategy(m[1], acting, note);
      else rejectStrategy(m[1], acting, note);
    } catch { /* ignore */ }
    redirect(res, '/');
    return true;
  }

  m = path.match(/^\/matter\/([0-9a-f-]+)\/deposition-prep$/i);
  if (m && method === 'GET') {
    const preps = listMatterDepositionPreps(m[1]);
    const body = `<h1>Deposition prep</h1>${preps.length ? `<table><tr><th>Witness</th><th>Created</th></tr>${preps.map((p) => `<tr><td>${escapeHtml(p.witness_name)}</td><td>${escapeHtml(p.created_at)}</td></tr>`).join('')}</table>` : '<p>No deposition preps yet.</p>'}<h2>New prep</h2><form method="post" action="/matter/${m[1]}/deposition-prep"><label>Witness name<input name="witness_name" required></label><label>Source document id<input name="source_document_id" required></label><button class="btn">Generate prep</button></form>`;
    html(res, 200, shell('Deposition prep', nav() + body));
    return true;
  }
  if (m && method === 'POST') {
    const body = await readBody(req);
    try {
      await generateDepositionPrep({
        matterId: m[1],
        witnessName: body.get('witness_name') ?? '',
        sourceDocumentId: body.get('source_document_id') ?? '',
        acting,
      });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); return true; }
    redirect(res, `/matter/${m[1]}/deposition-prep`);
    return true;
  }

  m = path.match(/^\/matter\/([0-9a-f-]+)\/negotiation$/i);
  if (m && method === 'GET') {
    const negs = listMatterNegotiations(m[1]);
    const body = `<h1>Contract negotiations</h1>${negs.map((n) => `<div class="card"><h3>${escapeHtml(n.contract_name)} (${n.status})</h3>${n.summary_markdown ? `<pre>${escapeHtml(n.summary_markdown)}</pre>` : ''}<h4>Versions</h4><table><tr><th>v#</th><th>From</th><th>Uploaded</th></tr>${listContractVersions(n.id).map((v) => `<tr><td>${v.version_number}</td><td>${escapeHtml(v.from_party ?? '?')}</td><td>${escapeHtml(v.uploaded_at)}</td></tr>`).join('')}</table></div>`).join('')}<h2>New negotiation</h2><form method="post" action="/matter/${m[1]}/negotiation"><label>Contract name<input name="contract_name" required></label><label>Client position<textarea name="client_position"></textarea></label><button class="btn">Create</button></form>`;
    html(res, 200, shell('Negotiations', nav() + body));
    return true;
  }
  if (m && method === 'POST') {
    const body = await readBody(req);
    createNegotiation({
      matterId: m[1],
      contractName: body.get('contract_name') ?? '(untitled)',
      clientPosition: body.get('client_position') ?? undefined,
      acting,
    });
    redirect(res, `/matter/${m[1]}/negotiation`);
    return true;
  }

  if (method === 'GET' && path === '/analytics/fee-benchmarking') {
    const benchmarks = listAllBenchmarks();
    const firmStats = getFirmFeeStats();
    const body = `<h1>Fee benchmarks</h1><h2>Public benchmarks</h2><table><tr><th>Matter type</th><th>Complexity</th><th>Low</th><th>Median</th><th>High</th><th>Source</th></tr>${benchmarks.map((b) => `<tr><td>${escapeHtml(b.matter_type)}</td><td>${b.complexity}</td><td>AUD ${b.low_aud.toFixed(0)}</td><td>AUD ${b.median_aud.toFixed(0)}</td><td>AUD ${b.high_aud.toFixed(0)}</td><td>${escapeHtml(b.source)}</td></tr>`).join('')}</table><h2>Firm averages</h2><table><tr><th>Matter type</th><th>Count</th><th>Avg billed</th><th>Avg AI cost</th></tr>${firmStats.map((s) => `<tr><td>${escapeHtml(s.matterType)}</td><td>${s.matterCount}</td><td>AUD ${s.averageBilledAud.toFixed(0)}</td><td>AUD ${s.averageAiCostAud.toFixed(2)}</td></tr>`).join('')}</table>`;
    html(res, 200, shell('Fee benchmarks', nav() + body));
    return true;
  }

  m = path.match(/^\/matter\/([0-9a-f-]+)\/jurisdiction-compare$/i);
  if (m && method === 'GET') {
    const list = listMatterJurisdictionComparisons(m[1]);
    const body = `<h1>Jurisdiction comparison</h1>${list.map((c) => `<div class="card"><h3>${escapeHtml(JSON.parse(c.jurisdictions_json).join(' vs '))}</h3><pre>${escapeHtml(c.comparison_markdown)}</pre></div>`).join('')}<h2>New comparison</h2><form method="post" action="/matter/${m[1]}/jurisdiction-compare"><label>Jurisdictions (comma-separated)<input name="jurisdictions" placeholder="NSW,VIC,QLD" required></label><label>Topic<input name="topic" required></label><button class="btn">Compare</button></form>`;
    html(res, 200, shell('Jurisdictions', nav() + body));
    return true;
  }
  if (m && method === 'POST') {
    const body = await readBody(req);
    await compareJurisdictions({
      matterId: m[1],
      jurisdictions: (body.get('jurisdictions') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      topic: body.get('topic') ?? '',
      acting,
    });
    redirect(res, `/matter/${m[1]}/jurisdiction-compare`);
    return true;
  }

  m = path.match(/^\/matter\/([0-9a-f-]+)\/explain-document$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    try {
      await explainDocument({
        matterId: m[1],
        sourceDocumentId: body.get('source_document_id') ?? '',
        acting,
      });
      redirect(res, `/matter/${m[1]}`);
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  if (path === '/intelligence/market' && method === 'GET') {
    const reports = listMarketReports();
    const body = `<h1>Market intelligence</h1><form method="post" action="/intelligence/market/generate"><label>Period (YYYY-MM)<input name="period" value="${new Date().toISOString().slice(0, 7)}"></label><button class="btn">Generate</button></form><table><tr><th>Period</th><th>Generated</th></tr>${reports.map((r) => `<tr><td><a href="/intelligence/market/${r.id}">${escapeHtml(r.period)}</a></td><td>${escapeHtml(r.generated_at)}</td></tr>`).join('')}</table>`;
    html(res, 200, shell('Market intel', nav() + body));
    return true;
  }
  if (path === '/intelligence/market/generate' && method === 'POST') {
    const body = await readBody(req);
    await generateMarketReport(body.get('period') ?? new Date().toISOString().slice(0, 7));
    redirect(res, '/intelligence/market');
    return true;
  }
  m = path.match(/^\/intelligence\/market\/([0-9a-f-]+)$/i);
  if (m && method === 'GET') {
    const r = getMarketReport(m[1]);
    if (!r) { html(res, 404, shell('Not found', 'Report not found')); return true; }
    html(res, 200, shell(`Market — ${r.period}`, nav() + `<h1>Market intelligence — ${escapeHtml(r.period)}</h1><pre>${escapeHtml(r.body_markdown)}</pre>`));
    return true;
  }

  if (path === '/intelligence/competitors' && method === 'GET') {
    const list = listCompetitors();
    const reports = listCompetitorReports();
    const body = `<h1>Competitor analysis</h1><h2>Tracked competitors</h2><table><tr><th>Firm</th><th>Website</th></tr>${list.map((c) => `<tr><td>${escapeHtml(c.firm_name)}</td><td>${escapeHtml(c.website ?? '')}</td></tr>`).join('')}</table><form method="post" action="/intelligence/competitors/add"><label>Firm name<input name="firm_name" required></label><label>Website<input name="website"></label><button class="btn">Add</button></form><h2>Recent reports</h2><table><tr><th>Competitor</th><th>Period</th><th>Generated</th></tr>${reports.map((r) => `<tr><td>${escapeHtml(r.competitor_id)}</td><td>${escapeHtml(r.period)}</td><td>${escapeHtml(r.generated_at)}</td></tr>`).join('')}</table>`;
    html(res, 200, shell('Competitors', nav() + body));
    return true;
  }
  if (path === '/intelligence/competitors/add' && method === 'POST') {
    const body = await readBody(req);
    addCompetitor({ firmName: body.get('firm_name') ?? '', website: body.get('website') ?? undefined, acting });
    redirect(res, '/intelligence/competitors');
    return true;
  }

  // ============================================================
  // SECTION 2 — Documents & Knowledge
  // ============================================================

  m = path.match(/^\/matter\/([0-9a-f-]+)\/document\/([0-9a-f-]+)\/versions$/i);
  if (m && method === 'GET') {
    const matterId = m[1];
    const docId = m[2];
    const versions = listDocVersions(docId);
    const summary = summariseVersions(docId, matterId);
    const body = `<h1>Document versions</h1>${summary ? `<p>${escapeHtml(summary.filename)} · ${summary.totalVersions} versions · ${(summary.totalBytes / 1024).toFixed(1)} KB total</p>` : ''}<table><tr><th>v#</th><th>By</th><th>Size</th><th>Change</th><th></th></tr>${versions.map((v) => `<tr><td>v${v.version_number}</td><td>${escapeHtml(v.modified_by)}</td><td>${v.size_bytes}</td><td>${escapeHtml(v.change_summary ?? '')}</td><td><form method="post" action="/matter/${matterId}/document/${docId}/rollback/${v.id}" onsubmit="return confirm('Rollback?')"><button class="btn">Rollback</button></form></td></tr>`).join('')}</table>`;
    html(res, 200, shell('Versions', nav() + body));
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/document\/([0-9a-f-]+)\/rollback\/([0-9a-f-]+)$/i);
  if (m && method === 'POST') {
    rollbackToVersion(m[2], m[3], acting);
    redirect(res, `/matter/${m[1]}/document/${m[2]}/versions`);
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/document\/([0-9a-f-]+)\/classify$/i);
  if (m && method === 'POST') {
    try { await classifyDocument({ documentId: m[2], matterId: m[1], acting }); }
    catch (err) { /* ignore */ }
    redirect(res, `/matter/${m[1]}`);
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/document\/([0-9a-f-]+)\/correct-classification$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    correctClassification({
      documentId: m[2],
      documentType: body.get('document_type') ?? undefined,
      practiceArea: body.get('practice_area') ?? undefined,
      acting,
    });
    redirect(res, `/matter/${m[1]}`);
    return true;
  }

  if (path === '/search' && method === 'GET') {
    const q = url.searchParams.get('q') ?? '';
    const results = q ? smartSearch({ query: q, userEmail: acting }) : [];
    const history = listSearchHistory(acting, 10);
    const body = `<h1>Smart search</h1><form><input name="q" value="${escapeHtml(q)}" placeholder="natural-language query" style="width:600px"><button class="btn">Search</button></form><h2>Results (${results.length})</h2>${results.map((r) => `<div class="card"><a href="${escapeHtml(r.url)}"><b>${escapeHtml(r.title ?? r.refId)}</b></a> <span style="color:#8a93a4">[${r.refKind} · ${(r.score * 100).toFixed(0)}%]</span><p>${escapeHtml(r.snippet)}</p></div>`).join('')}<h2>Recent searches</h2><ul>${history.map((h) => `<li>${escapeHtml(h.query)} (${h.result_count} results · ${escapeHtml(h.created_at)})</li>`).join('')}</ul><form method="post" action="/search/rebuild"><button class="btn">Rebuild index</button></form>`;
    html(res, 200, shell('Search', nav() + body));
    return true;
  }
  if (path === '/search/rebuild' && method === 'POST') {
    rebuildIndex();
    redirect(res, '/search');
    return true;
  }

  if (path === '/knowledge' && method === 'GET') {
    const q = url.searchParams.get('q') ?? '';
    const results = searchKnowledge({ text: q || undefined });
    const body = `<h1>Knowledge base</h1><form><input name="q" value="${escapeHtml(q)}" placeholder="search firm KB"><button class="btn">Search</button></form><table><tr><th>Title</th><th>Kind</th><th>Practice</th><th>Updated</th></tr>${results.map((r) => `<tr><td><a href="/knowledge/${r.id}">${escapeHtml(r.title)}</a></td><td>${r.kind}</td><td>${escapeHtml(r.practice_area ?? '')}</td><td>${escapeHtml(r.updated_at)}</td></tr>`).join('')}</table><h2>Add entry</h2><form method="post" action="/knowledge/create"><label>Title<input name="title" required></label><label>Kind<select name="kind"><option>know_how</option><option>research_memo</option><option>practice_note</option><option>procedure</option><option>lesson</option><option>policy</option></select></label><label>Practice area<input name="practice_area"></label><label>Body (markdown)<textarea name="body_markdown" required></textarea></label><button class="btn">Save</button></form>`;
    html(res, 200, shell('Knowledge', nav() + body));
    return true;
  }
  if (path === '/knowledge/create' && method === 'POST') {
    const body = await readBody(req);
    createKnowledgeEntry({
      title: body.get('title') ?? '',
      kind: (body.get('kind') ?? 'know_how') as 'know_how',
      practice_area: body.get('practice_area') ?? undefined,
      body_markdown: body.get('body_markdown') ?? '',
      author_email: acting,
    });
    redirect(res, '/knowledge');
    return true;
  }
  m = path.match(/^\/knowledge\/([0-9a-f-]+)$/i);
  if (m && method === 'GET') {
    const e = getKnowledgeEntry(m[1]);
    if (!e) { html(res, 404, shell('Not found', 'Knowledge entry not found')); return true; }
    const versions = listKnowledgeVersions(m[1]);
    const body = `<h1>${escapeHtml(e.title)}</h1><div class="card"><b>${e.kind}</b> · ${escapeHtml(e.practice_area ?? '')} · ${escapeHtml(e.author_email)}</div><pre>${escapeHtml(e.body_markdown)}</pre><h2>Versions (${versions.length})</h2><table><tr><th>v#</th><th>By</th><th>Note</th><th>Created</th></tr>${versions.map((v) => `<tr><td>${v.version_number}</td><td>${escapeHtml(v.author_email)}</td><td>${escapeHtml(v.change_note ?? '')}</td><td>${escapeHtml(v.created_at)}</td></tr>`).join('')}</table><h2>Update</h2><form method="post" action="/knowledge/${m[1]}/update"><textarea name="body_markdown">${escapeHtml(e.body_markdown)}</textarea><input name="change_note" placeholder="change note"><button class="btn">Save new version</button></form>`;
    html(res, 200, shell(e.title, nav() + body));
    return true;
  }
  m = path.match(/^\/knowledge\/([0-9a-f-]+)\/update$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    updateKnowledgeEntry({
      id: m[1],
      body_markdown: body.get('body_markdown') ?? '',
      change_note: body.get('change_note') ?? undefined,
      author_email: acting,
    });
    redirect(res, `/knowledge/${m[1]}`);
    return true;
  }

  if (path === '/clauses' && method === 'GET') {
    const q = url.searchParams.get('q') ?? '';
    const type = url.searchParams.get('type') ?? '';
    const results = searchClauses({ text: q || undefined, clauseType: type || undefined });
    const types = listClauseTypes();
    const body = `<h1>Clause library</h1><form><input name="q" value="${escapeHtml(q)}" placeholder="search clauses"><select name="type"><option value="">All types</option>${types.map((t) => `<option ${t === type ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select><button class="btn">Search</button></form><table><tr><th>Title</th><th>Type</th><th>Practice</th><th>Risk</th><th>Used</th></tr>${results.map((c) => `<tr><td><a href="/clauses/${c.id}">${escapeHtml(c.title)}</a></td><td>${escapeHtml(c.clause_type)}</td><td>${escapeHtml(c.practice_area ?? '')}</td><td>${c.risk_profile ?? ''}</td><td>${c.usage_count}</td></tr>`).join('')}</table><h2>Add clause</h2><form method="post" action="/clauses/create"><label>Title<input name="title" required></label><label>Clause type<input name="clause_type" required></label><label>Practice area<input name="practice_area"></label><label>Risk<select name="risk_profile"><option>low</option><option>medium</option><option>high</option></select></label><label>Approved text<textarea name="approved_text" required></textarea></label><label>Usage notes<textarea name="usage_notes"></textarea></label><button class="btn">Save</button></form>`;
    html(res, 200, shell('Clauses', nav() + body));
    return true;
  }
  if (path === '/clauses/create' && method === 'POST') {
    const body = await readBody(req);
    addClause({
      title: body.get('title') ?? '',
      clause_type: body.get('clause_type') ?? '',
      practice_area: body.get('practice_area') ?? undefined,
      risk_profile: (body.get('risk_profile') ?? 'medium') as 'low' | 'medium' | 'high',
      approved_text: body.get('approved_text') ?? '',
      usage_notes: body.get('usage_notes') ?? undefined,
      approved_by: acting,
    });
    redirect(res, '/clauses');
    return true;
  }
  m = path.match(/^\/clauses\/([0-9a-f-]+)$/i);
  if (m && method === 'GET') {
    const c = getClause(m[1]);
    if (!c) { html(res, 404, shell('Not found', '404')); return true; }
    html(res, 200, shell(c.title, nav() + `<h1>${escapeHtml(c.title)}</h1><div class="card"><b>Type:</b> ${escapeHtml(c.clause_type)} · <b>Risk:</b> ${c.risk_profile ?? '?'} · <b>Used:</b> ${c.usage_count}x</div><pre>${escapeHtml(c.approved_text)}</pre>${c.usage_notes ? `<h2>Usage notes</h2><pre>${escapeHtml(c.usage_notes)}</pre>` : ''}`));
    return true;
  }

  if (path === '/redline' && method === 'GET') {
    const list = listRedlineComparisons();
    const body = `<h1>Redline comparison</h1><form method="post" action="/redline"><label>Left label<input name="left_label" required></label><label>Left text<textarea name="left_text" required></textarea></label><label>Right label<input name="right_label" required></label><label>Right text<textarea name="right_text" required></textarea></label><button class="btn">Compare</button></form><h2>Recent</h2><table><tr><th>Left</th><th>Right</th><th>+/-</th><th>Created</th></tr>${list.map((r) => `<tr><td>${escapeHtml(r.left_doc_label)}</td><td>${escapeHtml(r.right_doc_label)}</td><td>+${r.added_count} -${r.removed_count}</td><td>${escapeHtml(r.created_at)}</td></tr>`).join('')}</table>`;
    html(res, 200, shell('Redline', nav() + body));
    return true;
  }
  if (path === '/redline' && method === 'POST') {
    const body = await readBody(req);
    const result = compareTexts({
      leftText: body.get('left_text') ?? '',
      rightText: body.get('right_text') ?? '',
      leftLabel: body.get('left_label') ?? 'left',
      rightLabel: body.get('right_label') ?? 'right',
      acting,
    });
    text(res, 200, result.html, 'text/html');
    return true;
  }

  // ============================================================
  // SECTION 3 — Clients & Matters
  // ============================================================

  if (path === '/crm/clients' && method === 'GET') {
    const clients = listClientRecords();
    const body = `<h1>Client CRM</h1><table><tr><th>Name</th><th>Email</th><th>Status</th><th>Type</th><th>Health</th></tr>${clients.map((c) => {
      const h = getLatestHealthScore(c.id);
      return `<tr><td><a href="/crm/clients/${c.id}">${escapeHtml(c.full_name)}</a></td><td>${escapeHtml(c.email ?? '')}</td><td>${c.status}</td><td>${c.client_type}</td><td>${h ? h.score : '-'}</td></tr>`;
    }).join('')}</table><h2>Add client</h2><form method="post" action="/crm/clients/create"><label>Name<input name="full_name" required></label><label>Email<input name="email"></label><label>Phone<input name="phone"></label><label>Type<select name="client_type"><option>individual</option><option>company</option><option>trust</option><option>government</option></select></label><label>Referral source<input name="referral_source"></label><button class="btn">Save</button></form>`;
    html(res, 200, shell('Clients', nav() + body));
    return true;
  }
  if (path === '/crm/clients/create' && method === 'POST') {
    const body = await readBody(req);
    createClientRecord({
      full_name: body.get('full_name') ?? '',
      email: body.get('email') ?? undefined,
      phone: body.get('phone') ?? undefined,
      client_type: (body.get('client_type') ?? 'individual') as 'individual',
      referral_source: body.get('referral_source') ?? undefined,
      acting,
    });
    redirect(res, '/crm/clients');
    return true;
  }
  m = path.match(/^\/crm\/clients\/([0-9a-f-]+)$/i);
  if (m && method === 'GET') {
    const c = getClientRecord(m[1]);
    if (!c) { html(res, 404, shell('Not found', '404')); return true; }
    const h = getLatestHealthScore(c.id);
    const history = listHealthScoreHistory(c.id, 12);
    html(res, 200, shell(c.full_name, nav() + `<h1>${escapeHtml(c.full_name)}</h1><div class="card"><b>Email:</b> ${escapeHtml(c.email ?? '')} · <b>Type:</b> ${c.client_type} · <b>Status:</b> ${c.status}</div>${h ? `<h2>Health: ${h.score}/100</h2>` : '<p>No health score yet.</p>'}<h3>History</h3><table><tr><th>Score</th><th>Computed</th></tr>${history.map((r) => `<tr><td>${r.score}</td><td>${escapeHtml(r.computed_at)}</td></tr>`).join('')}</table><form method="post" action="/crm/clients/${c.id}/recompute"><button class="btn">Recompute health</button></form>`));
    return true;
  }
  m = path.match(/^\/crm\/clients\/([0-9a-f-]+)\/recompute$/i);
  if (m && method === 'POST') {
    try { computeClientHealthScore(m[1]); } catch { /* ignore */ }
    redirect(res, `/crm/clients/${m[1]}`);
    return true;
  }
  if (path === '/crm/health/recompute-all' && method === 'POST') {
    computeAllHealthScores();
    redirect(res, '/crm/clients');
    return true;
  }

  if (path === '/onboardings' && method === 'GET') {
    const list = listOnboardingsByStatus();
    const body = `<h1>Client onboardings</h1><table><tr><th>Client</th><th>Status</th><th>Created</th></tr>${list.map((o) => `<tr><td>${escapeHtml(o.client_id)}</td><td>${o.status}</td><td>${escapeHtml(o.created_at)}</td></tr>`).join('')}</table><h2>Start</h2><form method="post" action="/onboardings"><label>Client id<input name="client_id" required></label><label>Matter title<input name="matter_title" required></label><label>Matter type<input name="matter_type" required></label><button class="btn">Begin</button></form>`;
    html(res, 200, shell('Onboardings', nav() + body));
    return true;
  }
  if (path === '/onboardings' && method === 'POST') {
    const body = await readBody(req);
    await startClientOnboarding({
      clientId: body.get('client_id') ?? '',
      matterTitle: body.get('matter_title') ?? '',
      matterType: body.get('matter_type') ?? '',
      responsibleLawyerEmail: acting,
      acting,
    });
    redirect(res, '/onboardings');
    return true;
  }
  m = path.match(/^\/onboarding\/([0-9a-f-]+)\/approve-letter$/i);
  if (m && method === 'POST') { await approveEngagementLetter(m[1], acting); redirect(res, '/onboardings'); return true; }
  m = path.match(/^\/onboarding\/([0-9a-f-]+)\/verify-identity$/i);
  if (m && method === 'POST') { markIdentityVerified(m[1], acting); redirect(res, '/onboardings'); return true; }

  // E-signature
  if (path === '/esign' && method === 'GET') {
    const list = listPendingEnvelopes();
    const body = `<h1>E-signature envelopes</h1><table><tr><th>Title</th><th>Status</th><th>Provider</th><th>Created</th></tr>${list.map((e) => `<tr><td><a href="/esign/${e.id}">${escapeHtml(e.document_title)}</a></td><td>${e.status}</td><td>${e.provider}</td><td>${escapeHtml(e.created_at)}</td></tr>`).join('')}</table>`;
    html(res, 200, shell('E-signature', nav() + body));
    return true;
  }
  m = path.match(/^\/esign\/([0-9a-f-]+)$/i);
  if (m && method === 'GET') {
    const env = getEnvelope(m[1]);
    if (!env) { html(res, 404, shell('Not found', '404')); return true; }
    const signers = listEnvelopeSigners(env.id);
    const body = `<h1>${escapeHtml(env.document_title)}</h1><div class="card">Status: ${env.status} · Provider: ${env.provider}</div><h2>Signers</h2><table><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Link</th></tr>${signers.map((s) => `<tr><td>${escapeHtml(s.signer_name)}</td><td>${escapeHtml(s.signer_email)}</td><td>${escapeHtml(s.role)}</td><td>${s.status}</td><td>${s.status === 'pending' ? `<a href="/sign/${s.signing_token}">Signing link</a>` : ''}</td></tr>`).join('')}</table><h2>Add signer</h2><form method="post" action="/esign/${env.id}/add-signer"><input name="name" placeholder="name" required><input name="email" placeholder="email" required><input name="role" placeholder="role" required><button class="btn">Add</button></form>${env.status === 'draft' ? `<form method="post" action="/esign/${env.id}/send"><button class="btn">Send envelope</button></form>` : ''}`;
    html(res, 200, shell('Envelope', nav() + body));
    return true;
  }
  m = path.match(/^\/esign\/([0-9a-f-]+)\/add-signer$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    addSigner({ envelopeId: m[1], signerName: body.get('name') ?? '', signerEmail: body.get('email') ?? '', role: body.get('role') ?? 'signer' });
    redirect(res, `/esign/${m[1]}`);
    return true;
  }
  m = path.match(/^\/esign\/([0-9a-f-]+)\/send$/i);
  if (m && method === 'POST') { sendEnvelope(m[1], acting); redirect(res, `/esign/${m[1]}`); return true; }

  // External signer (no auth — token in URL)
  m = path.match(/^\/sign\/([a-f0-9]+)$/i);
  if (m && method === 'GET') {
    const signer = getSignerByToken(m[1]);
    if (!signer) { text(res, 404, 'invalid or expired signing link'); return true; }
    const env = getEnvelope(signer.envelope_id);
    text(res, 200, `<!doctype html><html><body><h1>Sign: ${escapeHtml(env?.document_title ?? '')}</h1><p>Signer: ${escapeHtml(signer.signer_name)}</p>${signer.status === 'pending' ? `<form method="post"><label>Type your full name to sign: <input name="signature" required></label><br><br><button type="submit">Sign</button></form><form method="post" action="/sign/${m[1]}/decline"><button>Decline</button></form>` : `<p>Status: ${signer.status}</p>`}</body></html>`, 'text/html');
    return true;
  }
  m = path.match(/^\/sign\/([a-f0-9]+)$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.socket.remoteAddress ?? 'unknown';
    try {
      recordSignature({ signingToken: m[1], signatureData: body.get('signature') ?? '', signedIp: ip });
      text(res, 200, '<h1>Thank you. Your signature is recorded.</h1>', 'text/html');
    } catch (err) { text(res, 400, err instanceof Error ? err.message : 'error'); }
    return true;
  }
  m = path.match(/^\/sign\/([a-f0-9]+)\/decline$/i);
  if (m && method === 'POST') {
    declineSignature(m[1]);
    text(res, 200, '<h1>Signature declined.</h1>', 'text/html');
    return true;
  }

  // Surveys
  m = path.match(/^\/survey\/([a-f0-9]+)$/i);
  if (m && method === 'GET') {
    const s = getSurveyByToken(m[1]);
    if (!s) { text(res, 404, 'survey not found'); return true; }
    if (s.responded_at) { text(res, 200, '<h1>Thank you — already responded.</h1>', 'text/html'); return true; }
    text(res, 200, `<!doctype html><html><body><h1>Client satisfaction survey</h1><form method="post"><p>Overall satisfaction (1-5)<input type="number" name="overall_satisfaction" min="1" max="5" required></p><p>Communication quality (1-5)<input type="number" name="communication_quality" min="1" max="5" required></p><p>Value for money (1-5)<input type="number" name="value_for_money" min="1" max="5" required></p><p>Likelihood to recommend (0-10)<input type="number" name="nps" min="0" max="10" required></p><p>Open feedback<textarea name="open"></textarea></p><button>Submit</button></form></body></html>`, 'text/html');
    return true;
  }
  m = path.match(/^\/survey\/([a-f0-9]+)$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    submitResponse({
      surveyToken: m[1],
      overallSatisfaction: Number.parseInt(body.get('overall_satisfaction') ?? '0', 10),
      communicationQuality: Number.parseInt(body.get('communication_quality') ?? '0', 10),
      valueForMoney: Number.parseInt(body.get('value_for_money') ?? '0', 10),
      likelihoodToRecommend: Number.parseInt(body.get('nps') ?? '0', 10),
      openFeedback: body.get('open') ?? undefined,
    });
    text(res, 200, '<h1>Thank you for your feedback.</h1>', 'text/html');
    return true;
  }
  if (path === '/analytics/satisfaction' && method === 'GET') {
    const stats = getSatisfactionStats();
    const body = `<h1>Satisfaction</h1><table><tr><th>Surveys</th><th>Responded</th><th>Avg overall</th><th>Avg NPS</th><th>Promoters</th><th>Detractors</th><th>Flagged</th></tr><tr><td>${stats.total}</td><td>${stats.responded}</td><td>${stats.averageOverall?.toFixed(2) ?? '-'}</td><td>${stats.averageNps?.toFixed(1) ?? '-'}</td><td>${stats.promoterCount}</td><td>${stats.detractorCount}</td><td>${stats.flaggedCount}</td></tr></table>`;
    html(res, 200, shell('Satisfaction', nav() + body));
    return true;
  }

  if (path === '/analytics/referrals' && method === 'GET') {
    const r = getReferralStats();
    const body = `<h1>Referrals</h1><h2>By source</h2><table><tr><th>Source</th><th>Count</th><th>Value (AUD)</th></tr>${r.bySource.map((s) => `<tr><td>${escapeHtml(s.source)}</td><td>${s.count}</td><td>${s.totalValueAud.toFixed(2)}</td></tr>`).join('')}</table><h2>By referring client</h2><table><tr><th>Client</th><th>Referred</th><th>Value</th></tr>${r.byReferringClient.map((s) => `<tr><td>${escapeHtml(s.clientName)}</td><td>${s.referredCount}</td><td>${s.totalValueAud.toFixed(2)}</td></tr>`).join('')}</table><h2>By professional</h2><table><tr><th>Professional</th><th>Referred</th><th>Value</th></tr>${r.byProfessional.map((s) => `<tr><td>${escapeHtml(s.professional)}</td><td>${s.referredCount}</td><td>${s.totalValueAud.toFixed(2)}</td></tr>`).join('')}</table>`;
    html(res, 200, shell('Referrals', nav() + body));
    return true;
  }

  // Budgeting
  m = path.match(/^\/matter\/([0-9a-f-]+)\/budget$/i);
  if (m && method === 'GET') {
    const status = getBudgetStatus(m[1]);
    const disb = listMatterDisbursements(m[1]);
    const body = `<h1>Matter budget</h1>${status.budget ? `<div class="card">Estimate: AUD ${status.budget.estimated_total_aud.toFixed(2)} · ${status.percentageConsumed ?? '?'}% consumed</div>` : '<p>No budget set.</p>'}<p>Actual fee: AUD ${status.actualFeeAud.toFixed(2)}<br>Actual disbursements: AUD ${status.actualDisbursementsAud.toFixed(2)}</p><h2>Set / update budget</h2><form method="post" action="/matter/${m[1]}/budget"><label>Hours<input name="hours" type="number" step="0.5" required></label><label>Disbursements AUD<input name="disb" type="number" step="0.01" required></label><label>Total AUD<input name="total" type="number" step="0.01" required></label><button class="btn">Save</button></form><h2>Disbursements</h2><table><tr><th>Date</th><th>Description</th><th>AUD</th></tr>${disb.map((d) => `<tr><td>${escapeHtml(d.incurred_at.slice(0, 10))}</td><td>${escapeHtml(d.description)}</td><td>${d.amount_aud.toFixed(2)}</td></tr>`).join('')}</table><form method="post" action="/matter/${m[1]}/budget/disbursement"><input name="description" placeholder="description" required><input name="amount" type="number" step="0.01" placeholder="amount" required><button class="btn">Record</button></form>`;
    html(res, 200, shell('Budget', nav() + body));
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/budget$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    setMatterBudget({
      matterId: m[1],
      estimatedHours: Number.parseFloat(body.get('hours') ?? '0'),
      estimatedDisbursementsAud: Number.parseFloat(body.get('disb') ?? '0'),
      estimatedTotalAud: Number.parseFloat(body.get('total') ?? '0'),
      acting,
    });
    redirect(res, `/matter/${m[1]}/budget`);
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/budget\/disbursement$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    recordDisbursement({
      matterId: m[1],
      description: body.get('description') ?? '',
      amountAud: Number.parseFloat(body.get('amount') ?? '0'),
      acting,
    });
    redirect(res, `/matter/${m[1]}/budget`);
    return true;
  }

  // ============================================================
  // SECTION 4 — Compliance
  // ============================================================

  if (path === '/compliance/aml' && method === 'GET') {
    const flagged = listFlaggedScreenings();
    const period = new Date().toISOString().slice(0, 7);
    const report = generateMonthlyAmlReport(period);
    const body = `<h1>AML screening</h1><div class="card">Period ${escapeHtml(period)}: ${report.totalScreenings} total · ${report.flaggedRequiringReview} flagged · ${report.blocked} blocked</div><h2>Flagged (needs review)</h2><table><tr><th>Client</th><th>Matches</th><th>Screened</th></tr>${flagged.map((f) => `<tr><td>${escapeHtml(f.client_id)}</td><td>${f.match_count}</td><td>${escapeHtml(f.screened_at)}</td></tr>`).join('')}</table><h2>Run screening</h2><form method="post" action="/compliance/aml/screen"><label>Client id<input name="client_id" required></label><button class="btn">Screen</button></form>`;
    html(res, 200, shell('AML', nav() + body));
    return true;
  }
  if (path === '/compliance/aml/screen' && method === 'POST') {
    const body = await readBody(req);
    try { await screenClient({ clientId: body.get('client_id') ?? '', acting }); }
    catch { /* ignore */ }
    redirect(res, '/compliance/aml');
    return true;
  }
  m = path.match(/^\/compliance\/aml\/([0-9a-f-]+)\/(clear|block)$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    reviewScreening(m[1], acting, m[2] === 'clear' ? 'cleared_by_review' : 'blocked', body.get('note') ?? undefined);
    redirect(res, '/compliance/aml');
    return true;
  }

  if (path === '/compliance/pi-risk' && method === 'GET') {
    const list = listHighRiskMatters();
    const body = `<h1>PI risk (high)</h1><table><tr><th>Matter</th><th>Score</th><th>Computed</th></tr>${list.map((r) => `<tr><td>${escapeHtml(r.matter_id)}</td><td>${r.risk_score}/10</td><td>${escapeHtml(r.computed_at)}</td></tr>`).join('')}</table>`;
    html(res, 200, shell('PI risk', nav() + body));
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/pi-risk$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    computePIRisk(m[1], {
      clientSophistication: (body.get('sophistication') ?? 'medium') as 'low' | 'medium' | 'high',
      transactionValueAud: Number.parseFloat(body.get('value') ?? '0'),
      timePressureDays: body.get('pressure') ? Number.parseInt(body.get('pressure') ?? '0', 10) : null,
      complexity: (body.get('complexity') ?? 'medium') as 'simple' | 'medium' | 'complex',
      numberOfParties: Number.parseInt(body.get('parties') ?? '2', 10),
      multiJurisdiction: body.get('multi_jur') === 'on',
    });
    redirect(res, `/matter/${m[1]}`);
    return true;
  }

  if (path === '/compliance/regulatory' && method === 'GET') {
    const events = listRegulatoryEvents(180);
    const body = `<h1>Regulatory calendar</h1><table><tr><th>Event</th><th>Type</th><th>Due</th><th>For</th><th></th></tr>${events.map((e) => `<tr><td>${escapeHtml(e.title)}</td><td>${e.event_type}</td><td>${escapeHtml(e.due_date)}</td><td>${escapeHtml(e.applies_to_user_id ?? '(firm)')}</td><td><form method="post" action="/compliance/regulatory/${e.id}/complete"><button class="btn">Done</button></form></td></tr>`).join('')}</table><h2>Add event</h2><form method="post" action="/compliance/regulatory"><input name="title" placeholder="title" required><input name="event_type" placeholder="type" required><input name="due_date" type="date" required><button class="btn">Add</button></form>`;
    html(res, 200, shell('Regulatory', nav() + body));
    return true;
  }
  if (path === '/compliance/regulatory' && method === 'POST') {
    const body = await readBody(req);
    createRegulatoryEvent({
      title: body.get('title') ?? '',
      event_type: body.get('event_type') ?? '',
      due_date: body.get('due_date') ?? '',
    });
    redirect(res, '/compliance/regulatory');
    return true;
  }
  m = path.match(/^\/compliance\/regulatory\/([0-9a-f-]+)\/complete$/i);
  if (m && method === 'POST') { markEventComplete(m[1], acting); redirect(res, '/compliance/regulatory'); return true; }

  if (path === '/compliance/file-review' && method === 'GET') {
    const overdue = listOverdueReviews();
    const body = `<h1>Overdue file reviews</h1><table><tr><th>Matter</th><th>Due</th><th></th></tr>${overdue.map(({ schedule, matter }) => `<tr><td>${escapeHtml(matter.matter_number)} ${escapeHtml(matter.title)}</td><td>${escapeHtml(schedule.next_due_at.slice(0, 10))}</td><td><form method="post" action="/compliance/file-review/${matter.id}/complete"><input name="note" placeholder="note"><button class="btn">Mark complete</button></form></td></tr>`).join('')}</table>`;
    html(res, 200, shell('File reviews', nav() + body));
    return true;
  }
  m = path.match(/^\/compliance\/file-review\/([0-9a-f-]+)\/complete$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    ensureSchedule(m[1]);
    recordReview(m[1], acting, body.get('note') ?? undefined);
    redirect(res, '/compliance/file-review');
    return true;
  }

  if (path === '/compliance/costs-disclosure' && method === 'GET') {
    const checks = listCostsChecks(50);
    const report = nearMissReport(new Date().toISOString().slice(0, 7));
    const body = `<h1>Costs disclosure</h1><div class="card">This month: ${report.failed}/${report.total} failed</div><table><tr><th>Review</th><th>Passed</th><th>Missing</th><th>Checked</th></tr>${checks.map((c) => `<tr><td>${escapeHtml(c.engagement_letter_review_id ?? '')}</td><td>${c.passed ? '✓' : '✗'}</td><td>${escapeHtml(c.missing_elements_json ?? '')}</td><td>${escapeHtml(c.checked_at)}</td></tr>`).join('')}</table><h2>Check engagement letter</h2><form method="post" action="/compliance/costs-disclosure/check"><input name="review_id" placeholder="review id" required><button class="btn">Check</button></form>`;
    html(res, 200, shell('Costs', nav() + body));
    return true;
  }
  if (path === '/compliance/costs-disclosure/check' && method === 'POST') {
    const body = await readBody(req);
    try { checkEngagementLetter({ reviewId: body.get('review_id') ?? '' }); } catch { /* ignore */ }
    redirect(res, '/compliance/costs-disclosure');
    return true;
  }

  if (path === '/compliance/trust' && method === 'GET') {
    const recs = listReconciliations();
    const unmatched = listUnmatchedTransactions();
    const body = `<h1>Trust account</h1><h2>Reconciliations</h2><table><tr><th>Period</th><th>Closing</th><th>Unmatched</th><th>Signed off</th></tr>${recs.map((r) => `<tr><td>${escapeHtml(r.period_start)}..${escapeHtml(r.period_end)}</td><td>AUD ${r.closing_balance_aud.toFixed(2)}</td><td>${r.unmatched_count}</td><td>${r.signed_off_by ?? '-'}</td></tr>`).join('')}</table><h2>Unmatched (${unmatched.length})</h2><table><tr><th>Date</th><th>Amount</th><th>Description</th></tr>${unmatched.map((t) => `<tr><td>${escapeHtml(t.transaction_date)}</td><td>AUD ${t.amount_aud.toFixed(2)}</td><td>${escapeHtml(t.description ?? '')}</td></tr>`).join('')}</table><h2>Import bank CSV</h2><form method="post" action="/compliance/trust/import"><textarea name="csv" required placeholder="date,amount,description"></textarea><button class="btn">Import</button></form><h2>Generate reconciliation</h2><form method="post" action="/compliance/trust/reconcile"><input type="date" name="start" required><input type="date" name="end" required><button class="btn">Reconcile</button></form>`;
    html(res, 200, shell('Trust', nav() + body));
    return true;
  }
  if (path === '/compliance/trust/import' && method === 'POST') {
    const body = await readBody(req);
    importBankCsv({ csv: body.get('csv') ?? '', acting });
    redirect(res, '/compliance/trust');
    return true;
  }
  if (path === '/compliance/trust/reconcile' && method === 'POST') {
    const body = await readBody(req);
    generateReconciliation(body.get('start') ?? '', body.get('end') ?? '');
    redirect(res, '/compliance/trust');
    return true;
  }
  m = path.match(/^\/compliance\/trust\/([0-9a-f-]+)\/signoff$/i);
  if (m && method === 'POST') { signOffReconciliation(m[1], acting); redirect(res, '/compliance/trust'); return true; }

  // ============================================================
  // SECTION 5 — Communication & Collaboration
  // ============================================================

  m = path.match(/^\/matter\/([0-9a-f-]+)\/chat$/i);
  if (m && method === 'GET') {
    const msgs = listMatterChat(m[1]);
    const body = `<h1>Matter chat</h1><div class="card"><b>Internal only — never visible to clients.</b></div><div style="max-height:600px;overflow:auto">${msgs.map((msg) => `<div class="card"><b>${escapeHtml(msg.author_email)}</b> · ${escapeHtml(msg.created_at)}${msg.is_action_item ? ` <span class="flash-ok">ACTION → ${escapeHtml(msg.action_assignee ?? '')}</span>` : ''}<pre>${escapeHtml(msg.body)}</pre></div>`).join('')}</div><form method="post" action="/matter/${m[1]}/chat"><textarea name="body" required></textarea><label><input type="checkbox" name="action"> Action item</label><input name="assignee" placeholder="assignee email (if action)"><input name="due" type="date" placeholder="due date"><button class="btn">Post</button></form>`;
    html(res, 200, shell('Chat', nav() + body));
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/chat$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    postMessage({
      matterId: m[1],
      authorEmail: acting,
      body: body.get('body') ?? '',
      isActionItem: body.get('action') === 'on',
      actionAssignee: body.get('assignee') ?? undefined,
      actionDueDate: body.get('due') ?? undefined,
    });
    redirect(res, `/matter/${m[1]}/chat`);
    return true;
  }

  if (path === '/my/actions' && method === 'GET') {
    const items = listActionItemsForUser(acting);
    const body = `<h1>My action items</h1><table><tr><th>Matter</th><th>Due</th><th>Description</th><th></th></tr>${items.map((i) => `<tr><td><a href="/matter/${i.matter_id}/chat">${escapeHtml(i.matter_id)}</a></td><td>${escapeHtml(i.action_due_date ?? '')}</td><td>${escapeHtml(i.body)}</td><td><form method="post" action="/action/${i.id}/complete"><button class="btn">Done</button></form></td></tr>`).join('')}</table>`;
    html(res, 200, shell('My actions', nav() + body));
    return true;
  }
  m = path.match(/^\/action\/([0-9a-f-]+)\/complete$/i);
  if (m && method === 'POST') { completeActionItem(m[1], acting); redirect(res, '/my/actions'); return true; }

  // External counsel (token-protected, no auth)
  m = path.match(/^\/external-portal\/([a-f0-9]+)$/i);
  if (m && method === 'GET') {
    const token = m[1];
    const brief = getBriefByToken(token);
    if (!brief) { text(res, 404, 'brief expired or revoked'); return true; }
    logAccess(brief.id, 'view', null, (req.headers['x-forwarded-for'] as string)?.split(',')[0], req.headers['user-agent']);
    const docs = brief.shared_document_ids ? (JSON.parse(brief.shared_document_ids) as string[]) : [];
    text(res, 200, `<!doctype html><html><body><h1>Brief: ${escapeHtml(brief.counsel_name)}</h1><div>${escapeHtml(brief.instructions_markdown)}</div><h2>Documents</h2>${docs.map((d) => `<p><a href="/external-portal/${token}/doc/${d}">${escapeHtml(d)}</a></p>`).join('')}<h2>Upload</h2><form method="post" enctype="multipart/form-data"><input type="file" name="file" required><button>Upload</button></form></body></html>`, 'text/html');
    return true;
  }

  if (path === '/external-counsel' && method === 'GET') {
    const body = `<h1>External counsel briefs</h1><h2>Create brief</h2><form method="post" action="/external-counsel/create"><input name="matter_id" placeholder="matter id" required><input name="counsel_name" placeholder="counsel name" required><input name="counsel_email" placeholder="counsel email" required><input name="document_ids" placeholder="doc ids (comma)"><textarea name="instructions" placeholder="instructions" required></textarea><button class="btn">Create</button></form>`;
    html(res, 200, shell('External counsel', nav() + body));
    return true;
  }
  if (path === '/external-counsel/create' && method === 'POST') {
    const body = await readBody(req);
    const brief = createExternalBrief({
      matterId: body.get('matter_id') ?? '',
      counselName: body.get('counsel_name') ?? '',
      counselEmail: body.get('counsel_email') ?? '',
      instructingLawyerEmail: acting,
      instructionsMarkdown: body.get('instructions') ?? '',
      sharedDocumentIds: (body.get('document_ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    });
    text(res, 200, `<h1>Brief created</h1><p><a href="/external-portal/${brief.access_token}">Counsel link</a></p>`, 'text/html');
    return true;
  }
  m = path.match(/^\/external-counsel\/([0-9a-f-]+)\/revoke$/i);
  if (m && method === 'POST') { revokeBrief(m[1], acting); redirect(res, '/external-counsel'); return true; }

  // Calendar sync
  if (path === '/me/calendar-sync' && method === 'GET') {
    const cfg = getCalConfig(session.user.id);
    const body = `<h1>Calendar sync</h1>${cfg ? `<div class="card">Configured: ${cfg.provider} · ICS feed: <code>/calendar-feed/${cfg.ics_feed_token}</code></div>` : '<p>Not configured.</p>'}<form method="post" action="/me/calendar-sync"><label>Provider<select name="provider"><option>ics</option><option>google</option><option>outlook</option></select></label><button class="btn">Enable</button></form>`;
    html(res, 200, shell('Calendar sync', nav() + body));
    return true;
  }
  if (path === '/me/calendar-sync' && method === 'POST') {
    const body = await readBody(req);
    upsertCalendarConfig({
      userId: session.user.id,
      provider: (body.get('provider') ?? 'ics') as 'ics' | 'google' | 'outlook',
      acting,
    });
    redirect(res, '/me/calendar-sync');
    return true;
  }
  m = path.match(/^\/calendar-feed\/([a-f0-9]+)$/i);
  if (m && method === 'GET') {
    const cfg = getConfigByIcsToken(m[1]);
    if (!cfg) { text(res, 404, 'feed not found'); return true; }
    const ics = buildIcsFeed(cfg.user_id);
    text(res, 200, ics, 'text/calendar; charset=utf-8');
    return true;
  }

  // SMS
  m = path.match(/^\/matter\/([0-9a-f-]+)\/sms$/i);
  if (m && method === 'GET') {
    const list = listMatterSms(m[1]);
    const body = `<h1>Matter SMS</h1><table><tr><th>To</th><th>Status</th><th>Body</th></tr>${list.map((s) => `<tr><td>${escapeHtml(s.to_number)}</td><td>${s.status}</td><td>${escapeHtml(s.body)}</td></tr>`).join('')}</table><h2>Draft SMS</h2><form method="post" action="/matter/${m[1]}/sms"><input name="to" placeholder="+61..." required><textarea name="body" required></textarea><button class="btn">Draft for review</button></form>`;
    html(res, 200, shell('SMS', nav() + body));
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/sms$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    try {
      draftSms({ matterId: m[1], toNumber: body.get('to') ?? '', body: body.get('body') ?? '', authorEmail: acting });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); return true; }
    redirect(res, `/matter/${m[1]}/sms`);
    return true;
  }
  if (path === '/sms/twilio-webhook' && method === 'POST') {
    const body = await readBody(req);
    const params: Record<string, string> = {};
    body.forEach((v, k) => { params[k] = v; });
    handleTwilioWebhook(params);
    text(res, 200, '');
    return true;
  }

  // ============================================================
  // SECTION 6 — Analytics
  // ============================================================

  if (path === '/analytics/profitability' && method === 'GET') {
    const filters = {
      matterType: url.searchParams.get('matter_type') ?? undefined,
      lawyerEmail: url.searchParams.get('lawyer') ?? undefined,
      clientName: url.searchParams.get('client') ?? undefined,
    };
    const totals = profitabilityTotals(filters);
    const rows = profitabilityRows(filters);
    const trend = revenueTrendByMonth(12);
    const byArea = profitabilityByDimension('matterType', filters);
    const body = `<h1>Profitability</h1><div class="card">Matters: ${totals.matterCount} · Revenue: AUD ${totals.revenueAud.toFixed(0)} · AI cost: AUD ${totals.aiCostAud.toFixed(0)} · Profit: AUD ${totals.grossProfitAud.toFixed(0)}</div><h2>By practice area</h2><table><tr><th>Area</th><th>Matters</th><th>Revenue</th><th>Profit</th></tr>${byArea.map((r) => `<tr><td>${escapeHtml(r.key)}</td><td>${r.matterCount}</td><td>${r.revenueAud.toFixed(0)}</td><td>${r.profitAud.toFixed(0)}</td></tr>`).join('')}</table><h2>Trend (last 12 months)</h2><table><tr><th>Month</th><th>Revenue</th></tr>${trend.map((t) => `<tr><td>${t.ym}</td><td>AUD ${t.revenueAud.toFixed(0)}</td></tr>`).join('')}</table><h2>All matters</h2><table><tr><th>Matter</th><th>Client</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr>${rows.slice(0, 50).map((r) => `<tr><td>${escapeHtml(r.matterNumber)}</td><td>${escapeHtml(r.clientName)}</td><td>AUD ${r.revenueAud.toFixed(0)}</td><td>AUD ${r.grossProfitAud.toFixed(0)}</td><td>${r.marginPct.toFixed(0)}%</td></tr>`).join('')}</table>`;
    html(res, 200, shell('Profitability', nav() + body));
    return true;
  }

  if (path === '/analytics/lawyers' && method === 'GET') {
    const list = metricsForAllLawyers();
    const bench = firmBenchmarks();
    const body = `<h1>Lawyer performance</h1><div class="card">Firm avg matter duration: ${bench.averageMatterDurationDays.toFixed(0)}d · realisation: ${bench.averageRealisationRatePct.toFixed(0)}% · satisfaction: ${bench.averageSatisfaction.toFixed(1)}/5</div><table><tr><th>Lawyer</th><th>Opened</th><th>Closed</th><th>Realisation</th><th>Satisfaction</th><th>AI cost</th></tr>${list.map((m) => `<tr><td>${escapeHtml(m.fullName)}</td><td>${m.mattersOpened}</td><td>${m.mattersClosed}</td><td>${m.realisationRatePct?.toFixed(0) ?? '-'}%</td><td>${m.averageSatisfaction?.toFixed(1) ?? '-'}</td><td>USD ${m.aiCostUsd.toFixed(2)}</td></tr>`).join('')}</table>`;
    html(res, 200, shell('Lawyers', nav() + body));
    return true;
  }

  if (path === '/analytics/pipeline' && method === 'GET') {
    const win30 = forecastWindow(30);
    const win60 = forecastWindow(60);
    const win90 = forecastWindow(90);
    const byMonth = forecastByMonth(6);
    const risk = mattersAtRiskOfDelay();
    const body = `<h1>Pipeline forecast</h1><table><tr><th>Window</th><th>Expected revenue (AUD)</th><th>Matter count</th></tr><tr><td>Next 30 days</td><td>${win30.expectedRevenueAud.toFixed(0)}</td><td>${win30.matterCount}</td></tr><tr><td>Next 60 days</td><td>${win60.expectedRevenueAud.toFixed(0)}</td><td>${win60.matterCount}</td></tr><tr><td>Next 90 days</td><td>${win90.expectedRevenueAud.toFixed(0)}</td><td>${win90.matterCount}</td></tr></table><h2>By month</h2><table><tr><th>Month</th><th>Expected</th><th>Matters</th></tr>${byMonth.map((m) => `<tr><td>${m.ym}</td><td>AUD ${m.expectedRevenueAud.toFixed(0)}</td><td>${m.matterCount}</td></tr>`).join('')}</table><h2>At risk of delay</h2><table><tr><th>Matter</th><th>Reason</th></tr>${risk.map((r) => `<tr><td>${escapeHtml(r.matterNumber)}</td><td>${escapeHtml(r.reason)}</td></tr>`).join('')}</table>`;
    html(res, 200, shell('Pipeline', nav() + body));
    return true;
  }

  // ============================================================
  // SECTION 7 — Integrations
  // ============================================================

  if (path === '/admin/integrations' && method === 'GET') {
    const body = `<h1>Integrations</h1><table><tr><th>Provider</th><th>Status</th></tr><tr><td>Xero</td><td>${isXeroConfigured() ? '✓ configured' : '— not configured'}</td></tr><tr><td>DocuSign</td><td>${isDocuSignConfigured() ? '✓' : '—'}</td></tr><tr><td>Teams</td><td>${isTeamsConfigured() ? '✓' : '—'}</td></tr><tr><td>SSO</td><td>${isSsoEnabled() ? '✓' : '—'}</td></tr></table><h2>Xero</h2><form method="post" action="/admin/integrations/xero"><input name="client_id" placeholder="client_id"><input name="client_secret" placeholder="client_secret" type="password"><input name="access_token" placeholder="access_token"><input name="refresh_token" placeholder="refresh_token"><input name="tenant_id" placeholder="tenant_id"><button class="btn">Save</button></form><h2>Teams</h2><form method="post" action="/admin/integrations/teams"><input name="webhook_url" placeholder="webhook url"><input name="events" placeholder="event1,event2"><button class="btn">Save</button></form><h2>DocuSign</h2><form method="post" action="/admin/integrations/docusign"><input name="access_token" placeholder="access_token"><input name="refresh_token" placeholder="refresh_token"><input name="account_id" placeholder="account_id"><input name="base_uri" placeholder="https://account-d.docusign.com/restapi"><button class="btn">Save</button></form>`;
    html(res, 200, shell('Integrations', nav() + body));
    return true;
  }
  if (path === '/admin/integrations/xero' && method === 'POST') {
    const body = await readBody(req);
    saveXeroConfig({
      clientId: body.get('client_id') ?? '',
      clientSecret: body.get('client_secret') ?? '',
      accessToken: body.get('access_token') ?? '',
      refreshToken: body.get('refresh_token') ?? '',
      tokenExpiresAt: new Date(Date.now() + 1800000).toISOString(),
      tenantId: body.get('tenant_id') ?? '',
    }, acting);
    redirect(res, '/admin/integrations');
    return true;
  }
  if (path === '/admin/integrations/teams' && method === 'POST') {
    const body = await readBody(req);
    saveTeamsConfig({
      webhookUrl: body.get('webhook_url') ?? '',
      events: (body.get('events') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    }, acting);
    redirect(res, '/admin/integrations');
    return true;
  }
  if (path === '/admin/integrations/docusign' && method === 'POST') {
    const body = await readBody(req);
    saveDocuSignConfig({
      accessToken: body.get('access_token') ?? '',
      refreshToken: body.get('refresh_token') ?? '',
      accountId: body.get('account_id') ?? '',
      baseUri: body.get('base_uri') ?? '',
      tokenExpiresAt: new Date(Date.now() + 1800000).toISOString(),
    }, acting);
    redirect(res, '/admin/integrations');
    return true;
  }
  if (path === '/integrations/xero/pull-payments' && method === 'POST') { await pullPayments(); redirect(res, '/admin/integrations'); return true; }
  if (path === '/integrations/docusign/webhook' && method === 'POST') {
    const body = await readJson(req);
    handleDocuSignWebhook(body as Parameters<typeof handleDocuSignWebhook>[0]);
    text(res, 200, '');
    return true;
  }

  // Outlook + Zapier APIs
  if (path === '/api/outlook/file-email' && method === 'POST') {
    const body = await readJson(req);
    const result = fileEmailToMatter({ ...(body as Parameters<typeof fileEmailToMatter>[0]), acting });
    json(res, 200, result);
    return true;
  }
  if (path === '/api/outlook/create-matter' && method === 'POST') {
    const body = await readJson(req);
    const result = createMatterFromOutlook({ ...(body as Parameters<typeof createMatterFromOutlook>[0]), acting });
    json(res, 200, result);
    return true;
  }

  // Backups
  if (path === '/admin/backups' && method === 'GET') {
    const list = listBackupRuns(30);
    const body = `<h1>Backups</h1><table><tr><th>Started</th><th>Destination</th><th>Status</th><th>Size</th></tr>${list.map((r) => `<tr><td>${escapeHtml(r.started_at)}</td><td>${escapeHtml(r.destination)}</td><td>${r.status}</td><td>${r.bytes_written ?? '-'}</td></tr>`).join('')}</table><form method="post" action="/admin/backups/run"><button class="btn">Run backup now</button></form><form method="post" action="/admin/backups/verify"><button class="btn">Verify latest</button></form>`;
    html(res, 200, shell('Backups', nav() + body));
    return true;
  }
  if (path === '/admin/backups/run' && method === 'POST') { await runBackup(); redirect(res, '/admin/backups'); return true; }
  if (path === '/admin/backups/verify' && method === 'POST') { await verifyMostRecentBackup(); redirect(res, '/admin/backups'); return true; }

  // ============================================================
  // SECTION 8 — Paralegal Replacement
  // ============================================================

  if (path === '/me/email-config' && method === 'GET') {
    const cfg = getLawyerEmailConfig(session.user.id);
    const body = `<h1>My email config</h1>${cfg ? `<p>From: ${escapeHtml(cfg.from_address)} via ${escapeHtml(cfg.smtp_host)}${cfg.verified_at ? ' (verified)' : ''}</p>` : '<p>Not configured.</p>'}<form method="post"><input name="smtp_host" placeholder="smtp host" required><input name="smtp_port" placeholder="port" value="587" type="number"><input name="smtp_user" placeholder="smtp user" required><input type="password" name="smtp_password" placeholder="smtp password" required><label><input type="checkbox" name="smtp_secure" checked> TLS</label><input name="from_address" placeholder="from@firm.com" required><input name="from_name" placeholder="from name"><button class="btn">Save</button></form>${cfg ? `<form method="post" action="/me/email-config/verify"><button class="btn">Verify SMTP</button></form>` : ''}`;
    html(res, 200, shell('Email config', nav() + body));
    return true;
  }
  if (path === '/me/email-config' && method === 'POST') {
    const body = await readBody(req);
    upsertLawyerEmailConfig({
      userId: session.user.id,
      smtpHost: body.get('smtp_host') ?? '',
      smtpPort: Number.parseInt(body.get('smtp_port') ?? '587', 10),
      smtpUser: body.get('smtp_user') ?? '',
      smtpPassword: body.get('smtp_password') ?? '',
      smtpSecure: body.get('smtp_secure') === 'on',
      fromAddress: body.get('from_address') ?? '',
      fromName: body.get('from_name') ?? undefined,
      acting,
    });
    redirect(res, '/me/email-config');
    return true;
  }
  if (path === '/me/email-config/verify' && method === 'POST') {
    await verifyLawyerSmtp(session.user.id);
    redirect(res, '/me/email-config');
    return true;
  }

  m = path.match(/^\/outbound\/([0-9a-f-]+)\/send$/i);
  if (m && method === 'POST') {
    try { await sendOutboundEmail(m[1], acting); redirect(res, '/'); }
    catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  if (path === '/document-requests' && method === 'GET') {
    const list = listAllOpenRequests();
    const body = `<h1>Open document requests</h1><table><tr><th>Matter</th><th>Client</th><th>Documents</th><th>Deadline</th></tr>${list.map((r) => `<tr><td>${escapeHtml(r.matter_id)}</td><td>${escapeHtml(r.client_email)}</td><td>${escapeHtml(r.documents_requested.slice(0, 80))}</td><td>${escapeHtml(r.deadline_date)}</td></tr>`).join('')}</table><form method="post" action="/document-requests/run-reminders"><button class="btn">Run reminders</button></form>`;
    html(res, 200, shell('Doc requests', nav() + body));
    return true;
  }
  if (path === '/document-requests/run-reminders' && method === 'POST') { dispatchDocReminders(); redirect(res, '/document-requests'); return true; }

  m = path.match(/^\/matter\/([0-9a-f-]+)\/invoices$/i);
  if (m && method === 'GET') {
    const list = listMatterInvoices(m[1]);
    const body = `<h1>Invoices</h1><table><tr><th>Number</th><th>Issued</th><th>Due</th><th>Total</th><th>Status</th></tr>${list.map((i) => `<tr><td>${escapeHtml(i.invoice_number)}</td><td>${i.issue_date}</td><td>${i.due_date}</td><td>AUD ${i.total_aud.toFixed(2)}</td><td>${i.status}</td></tr>`).join('')}</table><form method="post" action="/matter/${m[1]}/invoices/draft"><button class="btn">Draft invoice from billing</button></form>`;
    html(res, 200, shell('Invoices', nav() + body));
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/invoices\/draft$/i);
  if (m && method === 'POST') { draftInvoice({ matterId: m[1], acting }); redirect(res, `/matter/${m[1]}/invoices`); return true; }

  if (path === '/billing/overdue' && method === 'GET') {
    const list = listOverdueInvoices();
    const ageing = ageingReport();
    const body = `<h1>Overdue invoices</h1><div class="card">1-30: AUD ${ageing.d1_30.totalAud.toFixed(0)} · 31-60: AUD ${ageing.d31_60.totalAud.toFixed(0)} · 61-90: AUD ${ageing.d61_90.totalAud.toFixed(0)} · 90+: AUD ${ageing.d90_plus.totalAud.toFixed(0)}</div><table><tr><th>Invoice</th><th>Matter</th><th>Due</th><th>Days overdue</th><th>Owing</th></tr>${list.map((o) => `<tr><td>${escapeHtml(o.invoice.invoice_number)}</td><td>${escapeHtml(o.matterNumber)}</td><td>${o.invoice.due_date}</td><td>${o.daysOverdue}</td><td>AUD ${(o.invoice.total_aud - o.invoice.amount_paid_aud).toFixed(2)}</td></tr>`).join('')}</table><form method="post" action="/billing/run-reminders"><button class="btn">Run payment reminders</button></form>`;
    html(res, 200, shell('Overdue', nav() + body));
    return true;
  }
  if (path === '/billing/run-reminders' && method === 'POST') { dispatchPaymentReminders(acting); redirect(res, '/billing/overdue'); return true; }
  m = path.match(/^\/invoices\/([0-9a-f-]+)\/payment$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    recordPayment(m[1], Number.parseFloat(body.get('amount') ?? '0'), body.get('method') ?? 'manual', acting);
    draftPaymentReceipt(m[1], acting);
    redirect(res, '/billing/overdue');
    return true;
  }

  // ============================================================
  // SECTION 9 — Enterprise
  // ============================================================

  if (path === '/admin/sso' && method === 'GET') {
    const azure = getSsoConfig('azure_ad');
    const google = getSsoConfig('google_workspace');
    const body = `<h1>SSO</h1><div class="card">Azure AD: ${azure ? '✓' : '—'} · Google: ${google ? '✓' : '—'}</div><h2>Configure Azure AD</h2><form method="post" action="/admin/sso/azure_ad"><input name="client_id" placeholder="client_id"><input name="client_secret" type="password" placeholder="client_secret"><input name="tenant_id" placeholder="tenant_id"><input name="redirect_uri" placeholder="https://.../sso/callback"><input name="allowed_domains" placeholder="firm.com,..."><button class="btn">Save</button></form><h2>Configure Google</h2><form method="post" action="/admin/sso/google_workspace"><input name="client_id" placeholder="client_id"><input name="client_secret" type="password" placeholder="client_secret"><input name="redirect_uri" placeholder="https://.../sso/callback"><input name="allowed_domains" placeholder="firm.com"><button class="btn">Save</button></form>`;
    html(res, 200, shell('SSO', nav() + body));
    return true;
  }
  m = path.match(/^\/admin\/sso\/(azure_ad|google_workspace)$/i);
  if (m && method === 'POST') {
    const body = await readBody(req);
    saveSsoConfig({
      provider: m[1] as 'azure_ad' | 'google_workspace',
      config: {
        clientId: body.get('client_id') ?? '',
        clientSecret: body.get('client_secret') ?? '',
        tenantId: body.get('tenant_id') ?? undefined,
        redirectUri: body.get('redirect_uri') ?? '',
        allowedDomains: (body.get('allowed_domains') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      },
    }, acting);
    redirect(res, '/admin/sso');
    return true;
  }
  m = path.match(/^\/sso\/(azure_ad|google_workspace)$/i);
  if (m && method === 'GET') {
    try {
      const r = startSsoFlow(m[1] as 'azure_ad' | 'google_workspace');
      redirect(res, r.authUrl);
    } catch (err) { text(res, 400, err instanceof Error ? err.message : 'sso error'); }
    return true;
  }
  if (path === '/sso/callback' && method === 'GET') {
    const code = url.searchParams.get('code') ?? '';
    const state = url.searchParams.get('state') ?? '';
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.socket.remoteAddress ?? 'unknown';
    const result = await handleSsoCallback(state, code, ip, req.headers['user-agent']);
    if (!result.ok) { text(res, 400, `SSO error: ${result.error}`); return true; }
    res.writeHead(303, { location: '/', 'set-cookie': `sid=${result.session?.id}; HttpOnly; Path=/; SameSite=Lax` });
    res.end();
    return true;
  }

  if (path === '/admin/practice-groups' && method === 'GET') {
    const groups = listPracticeGroups();
    const body = `<h1>Practice groups</h1><table><tr><th>Name</th><th>Description</th></tr>${groups.map((g) => `<tr><td>${escapeHtml(g.name)}</td><td>${escapeHtml(g.description ?? '')}</td></tr>`).join('')}</table><form method="post" action="/admin/practice-groups"><input name="name" placeholder="name" required><input name="description" placeholder="description"><button class="btn">Create</button></form>`;
    html(res, 200, shell('Practice groups', nav() + body));
    return true;
  }
  if (path === '/admin/practice-groups' && method === 'POST') {
    const body = await readBody(req);
    createPracticeGroup(body.get('name') ?? '', acting, body.get('description') ?? undefined);
    redirect(res, '/admin/practice-groups');
    return true;
  }

  if (path === '/supervision' && method === 'GET') {
    const list = listPendingSecondaryReviews(acting);
    const body = `<h1>Supervision queue</h1><table><tr><th>Matter</th><th>Title</th><th>Created</th></tr>${list.map((s) => `<tr><td>${escapeHtml(s.matter_id)}</td><td>—</td><td>${escapeHtml(s.created_at)}</td></tr>`).join('')}</table>`;
    html(res, 200, shell('Supervision', nav() + body));
    return true;
  }

  if (path === '/admin/import' && method === 'GET') {
    const body = `<h1>Bulk import</h1><form method="post" action="/admin/import"><label>Source<select name="source"><option>csv</option><option>leap</option><option>clio</option></select></label><label>CSV<textarea name="csv" required></textarea></label><button class="btn">Import</button></form>`;
    html(res, 200, shell('Import', nav() + body));
    return true;
  }
  if (path === '/admin/import' && method === 'POST') {
    const body = await readBody(req);
    const rows = parseImportCsv(body.get('csv') ?? '');
    const { run } = commitImport({ source: (body.get('source') ?? 'csv') as ImportSource, rows, acting });
    text(res, 200, `<h1>Import complete</h1><p>${run.success_count} ok, ${run.failure_count} failed, ${run.skipped_count} skipped.</p><a href="/">Back</a>`, 'text/html');
    return true;
  }

  if (path === '/admin/branding' && method === 'GET') {
    const b = getBranding();
    const body = `<h1>Branding</h1><form method="post"><label>Firm name<input name="firm_name" value="${escapeHtml(b.firm_name)}"></label><label>Primary colour<input name="primary_color" value="${escapeHtml(b.primary_color ?? '#7aa2f7')}"></label><label>Accent colour<input name="accent_color" value="${escapeHtml(b.accent_color ?? '#6dd29b')}"></label><label>Login tagline<input name="login_tagline" value="${escapeHtml(b.login_tagline ?? '')}"></label><button class="btn">Save</button></form>`;
    html(res, 200, shell('Branding', nav() + body));
    return true;
  }
  if (path === '/admin/branding' && method === 'POST') {
    const body = await readBody(req);
    updateBranding({
      firmName: body.get('firm_name') ?? undefined,
      primaryColor: body.get('primary_color') ?? undefined,
      accentColor: body.get('accent_color') ?? undefined,
      loginTagline: body.get('login_tagline') ?? undefined,
      updatedBy: acting,
    });
    redirect(res, '/admin/branding');
    return true;
  }

  if (path === '/admin/api-keys' && method === 'GET') {
    const keys = listApiKeys();
    const body = `<h1>API keys</h1><table><tr><th>Name</th><th>Prefix</th><th>Created</th><th>Last used</th><th></th></tr>${keys.map((k) => `<tr><td>${escapeHtml(k.name)}</td><td><code>${escapeHtml(k.key_prefix)}</code></td><td>${escapeHtml(k.created_at)}</td><td>${escapeHtml(k.last_used_at ?? '-')}</td><td><form method="post" action="/admin/api-keys/${k.id}/revoke"><button class="btn">Revoke</button></form></td></tr>`).join('')}</table><form method="post"><input name="name" placeholder="key name" required><button class="btn">Create new</button></form>`;
    html(res, 200, shell('API keys', nav() + body));
    return true;
  }
  if (path === '/admin/api-keys' && method === 'POST') {
    const body = await readBody(req);
    const result = createApiKey({ name: body.get('name') ?? 'unnamed', createdBy: acting });
    text(res, 200, `<h1>New API key</h1><p>Save this — it will not be shown again:</p><pre>${escapeHtml(result.plaintext)}</pre><a href="/admin/api-keys">Back</a>`, 'text/html');
    return true;
  }
  m = path.match(/^\/admin\/api-keys\/([0-9a-f-]+)\/revoke$/i);
  if (m && method === 'POST') { revokeApiKey(m[1], acting); redirect(res, '/admin/api-keys'); return true; }

  if (path === '/admin/offices' && method === 'GET') {
    const list = listOffices();
    const stats = officeStats();
    const body = `<h1>Offices</h1><table><tr><th>Name</th><th>Matters</th><th>Users</th></tr>${stats.map((s) => `<tr><td>${escapeHtml(s.officeName)}</td><td>${s.matterCount}</td><td>${s.userCount}</td></tr>`).join('')}</table><form method="post"><input name="name" placeholder="name" required><input name="address" placeholder="address"><button class="btn">Create</button></form>`;
    html(res, 200, shell('Offices', nav() + body));
    return true;
  }
  if (path === '/admin/offices' && method === 'POST') {
    const body = await readBody(req);
    createOffice(body.get('name') ?? '', acting, body.get('address') ?? undefined);
    redirect(res, '/admin/offices');
    return true;
  }

  if (path === '/admin/monitoring' && method === 'GET') {
    const events = listMonitoringEvents(50);
    const status = currentHealthStatus();
    const body = `<h1>Monitoring</h1><div class="card"><b>Overall: ${status.ok ? '✓ OK' : '✗ Degraded'}</b></div><table><tr><th>Component</th><th>Status</th></tr>${status.components.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${c.status}</td></tr>`).join('')}</table><h2>Metrics</h2><pre>${escapeHtml(JSON.stringify(status.metrics, null, 2))}</pre><h2>Recent events</h2><table><tr><th>Time</th><th>Kind</th><th>Severity</th><th>Message</th></tr>${events.map((e) => `<tr><td>${escapeHtml(e.created_at)}</td><td>${escapeHtml(e.kind)}</td><td>${e.severity}</td><td>${escapeHtml(e.message)}</td></tr>`).join('')}</table>`;
    html(res, 200, shell('Monitoring', nav() + body));
    return true;
  }
  if (path === '/status' && method === 'GET') {
    const status = currentHealthStatus();
    json(res, 200, status);
    return true;
  }

  // ============================================================
  // Client intake intelligence layer
  // ============================================================
  if (path === '/intake' && method === 'GET') {
    html(res, 200, shell('Client intake', nav() + renderIntakeDashboard()));
    return true;
  }
  m = path.match(/^\/matter\/([0-9a-f-]+)\/intake$/i);
  if (m && method === 'GET') {
    const body = renderMatterIntakeView(m[1]);
    if (!body) { html(res, 404, shell('Not found', nav() + '<h1>Matter not found</h1>')); return true; }
    html(res, 200, shell('Matter intake', nav() + body));
    return true;
  }

  // Suppress unused-import warnings while keeping the import surface in place.
  void listMatters; void getMatterById; void appendLegalAudit;
  void juniorApprove; void supervisorApprove; void supervisorEdit; void supervisorReject;
  void enableSupervision; void disableSupervision; void getSupervision;
  void assignUserToGroup; void removeUserFromGroup; void assignMatterToGroup; void listUserGroups; void listMatterGroups; void listMattersForUser;
  void assignUserToOffice; void assignMatterToOffice;
  void subscribeWebhook; void unsubscribeWebhook; void listWebhookSubs; void handleIncomingWebhook;
  void compareMatterAgainstBenchmark;
  void recordOptOut;
  void createSignatureEnvelope;
  void logCallFromAudio; void draftFollowUpFromCallNote; void listMatterCallNotes;
  void getMatterSummaryForAddin; void createTaskFromEmail; void createDeadlineFromEmail;
  void scheduleSurvey; void getInvoice; void markInvoiceSent; void generateMonthlyInvoices;
  void promoteActionItemsToChat; void canCounselSeeDocument; void listCounselUploads; void listAccessLog;
  void getBrief; void getDocumentClassification; void metricsForLawyer; void matterPipelines;
  void updateClient; void getLawyerEmailConfig; void queueOutboundEmail; void listOutboundEmails;
  void listMatterRequests; void markCompleted; void listMatterTrustLedger;
  void getRedlineComparison; void listImportRuns; void previewImport;
  void createDocumentRequest;

  return false;
}
