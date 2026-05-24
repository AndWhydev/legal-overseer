/**
 * Briefing scheduler — Legal Overseer.
 *
 * Renders the daily briefing as HTML and emails it to the managing
 * partner on a cron schedule. Default schedule: 08:00 server time.
 * Override with BRIEFING_CRON env.
 */

import cron from 'node-cron';
import { aggregateDailyBriefing } from './aggregator.js';
import { sendBriefingEmail, isEmailConfigured } from '../email/notifier.js';
import { createSafeLogger } from '../governance/index.js';
import type { DailyBriefing, BriefingAlert } from './types.js';

const logger = createSafeLogger('BriefingScheduler');

export const DEFAULT_BRIEFING_CRON = '0 8 * * *';

export type ScheduledTask = ReturnType<typeof cron.schedule>;

let scheduledTask: ScheduledTask | null = null;

function escapeHtml(text: string): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtSeconds(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec - h * 3600) / 60);
  return `${h}h ${m}m`;
}

function severityColor(s: BriefingAlert['severity']): string {
  return s === 'critical' ? '#c0392b' : s === 'warning' ? '#d49a3b' : '#586574';
}

export function formatBriefingMessage(b: DailyBriefing): string {
  const alerts = b.alerts.length
    ? b.alerts
        .map(
          (a) =>
            `<li style="color:${severityColor(a.severity)}"><b>[${a.severity.toUpperCase()}]</b> ${escapeHtml(a.title)} — ${escapeHtml(a.detail)}</li>`,
        )
        .join('')
    : '<li>No alerts.</li>';

  return `
    <h1>Legal Overseer — Daily Briefing</h1>
    <p style="color:#666">Generated ${escapeHtml(b.generatedAt)} (window: last ${b.windowHours}h)</p>

    <h2>Alerts</h2>
    <ul>${alerts}</ul>

    <h2>Matters</h2>
    <ul>
      <li>Open: <b>${b.matters.openTotal}</b></li>
      <li>On hold: ${b.matters.onHold}</li>
      <li>New in window: ${b.matters.newInWindow}</li>
      <li>Closed in window: ${b.matters.closedInWindow}</li>
    </ul>

    <h2>Review queue</h2>
    <ul>
      <li>Pending: <b>${b.reviewQueue.pending}</b> (${b.reviewQueue.stuck} stuck > 48h)</li>
      <li>Approved in window: ${b.reviewQueue.approvedInWindow}</li>
      <li>Rejected in window: ${b.reviewQueue.rejectedInWindow}</li>
      <li>Sent in window: ${b.reviewQueue.sentInWindow}</li>
    </ul>

    <h2>Deadlines (next 14 days)</h2>
    <ul>
      <li>Upcoming: <b>${b.deadlines.upcomingCount}</b></li>
      <li>Limitation periods: <b>${b.deadlines.upcomingLimitations}</b></li>
      <li>Overdue: ${b.deadlines.overdueCount}</li>
    </ul>

    <h2>Billing (window)</h2>
    <ul>
      <li>AI runs: ${b.billing.aiRunsInWindow}</li>
      <li>AI spend: $${b.billing.aiSpendUsdInWindow.toFixed(2)}</li>
      <li>AI time: ${fmtSeconds(b.billing.aiSecondsInWindow)}</li>
      <li>Lawyer time: ${fmtSeconds(b.billing.lawyerSecondsInWindow)}</li>
      <li>Open matters with no activity in window: ${b.billing.staleMatters}</li>
    </ul>

    <h2>System health</h2>
    <ul>
      <li>Status: <b>${escapeHtml(b.systemHealth.status)}</b></li>
      <li>Audit chain: ${b.systemHealth.auditChainOk ? 'OK' : `BROKEN — ${escapeHtml(b.systemHealth.auditChainBreak ?? '')}`}</li>
      <li>Kill switch: ${b.systemHealth.killSwitchActive ? 'ACTIVE' : 'off'}</li>
      <li>Disabled agents: ${b.systemHealth.disabledAgents.length ? escapeHtml(b.systemHealth.disabledAgents.join(', ')) : 'none'}</li>
      <li>Circuit breakers: ${b.systemHealth.circuitBreakers.map((c) => `${escapeHtml(c.name)}=${c.state}`).join(', ') || 'none'}</li>
    </ul>

    <p style="color:#888;font-size:12px"><i>Briefing is automated; nothing in it constitutes legal advice. AI outputs awaiting review at /review.</i></p>
  `;
}

export async function sendScheduledBriefing(windowHours = 24): Promise<boolean> {
  if (!isEmailConfigured()) {
    logger.warn('SMTP not configured; skipping briefing email.');
    return false;
  }
  const briefing = aggregateDailyBriefing(windowHours);
  const html = formatBriefingMessage(briefing);
  const messageId = await sendBriefingEmail(
    `Legal Overseer — Daily Briefing (${briefing.systemHealth.status})`,
    html,
  );
  if (messageId) {
    logger.info(`Briefing sent (id=${messageId})`);
    return true;
  }
  return false;
}

export async function runBriefingNow(windowHours = 24): Promise<DailyBriefing> {
  const briefing = aggregateDailyBriefing(windowHours);
  await sendScheduledBriefing(windowHours);
  return briefing;
}

export function initBriefingScheduler(): void {
  if (process.env.BRIEFING_ENABLED !== 'true') {
    logger.info('Disabled (set BRIEFING_ENABLED=true to enable scheduled briefing emails)');
    return;
  }
  if (scheduledTask) {
    logger.info('Briefing scheduler already running');
    return;
  }
  const expr = process.env.BRIEFING_CRON || DEFAULT_BRIEFING_CRON;
  scheduledTask = cron.schedule(expr, () => {
    sendScheduledBriefing().catch((err) => {
      logger.error(`Briefing send failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  });
  logger.info(`Briefing scheduler started (cron: ${expr})`);
}

export function stopBriefingScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Briefing scheduler stopped');
  }
}
