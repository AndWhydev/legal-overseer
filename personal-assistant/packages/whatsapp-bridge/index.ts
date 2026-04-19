/**
 * WhatsApp Baileys Bridge Worker
 *
 * Standalone Node.js process that:
 * 1. Watches `whatsapp_sessions` for rows with status = 'qr_pending'
 * 2. Initializes Baileys sockets per session
 * 3. Pushes QR data back to Supabase for the dashboard to render
 * 4. On auth success, stores session_data and sets status = 'connected'
 * 5. Picks up outbound messages from `whatsapp_outbox`
 */

import { createClient } from '@supabase/supabase-js';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';

// ─── Config ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AUTH_DIR = process.env.WA_AUTH_DIR ?? './wa-sessions';
const POLL_INTERVAL_MS = 5_000;
const OUTBOX_POLL_MS = 2_000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Track active sockets per session ID
const activeSockets = new Map<string, ReturnType<typeof makeWASocket>>();

// ─── Session Management ────────────────────────────────────────────────────

async function startSession(sessionId: string, orgId: string) {
  if (activeSockets.has(sessionId)) return;

  const sessionDir = path.join(AUTH_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  // `useMultiFileAuthState` is a Baileys utility (not a React hook) — the
  // rules-of-hooks heuristic misfires on the `use` prefix.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
  });

  activeSockets.set(sessionId, sock);

  // Handle connection updates
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Convert QR string to base64 data URL
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
        await supabase
          .from('whatsapp_sessions')
          .update({ qr_data: qrDataUrl, status: 'qr_pending', updated_at: new Date().toISOString() })
          .eq('id', sessionId);
        console.log(`[${sessionId}] QR code generated`);
      } catch (err) {
        console.error(`[${sessionId}] QR generation failed:`, err);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      activeSockets.delete(sessionId);

      if (shouldReconnect) {
        console.log(`[${sessionId}] Reconnecting...`);
        setTimeout(() => startSession(sessionId, orgId), 3000);
      } else {
        console.log(`[${sessionId}] Logged out, cleaning up`);
        await supabase
          .from('whatsapp_sessions')
          .update({ status: 'disconnected', qr_data: null, updated_at: new Date().toISOString() })
          .eq('id', sessionId);
      }
    }

    if (connection === 'open') {
      const phoneNumber = sock.user?.id?.split(':')[0] ?? null;
      console.log(`[${sessionId}] Connected as ${phoneNumber}`);
      await supabase
        .from('whatsapp_sessions')
        .update({
          status: 'connected',
          phone_number: phoneNumber,
          qr_data: null,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    }
  });

  // Persist credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Handle incoming messages — insert into channel_messages for the main app
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const sender = msg.key.remoteJid ?? '';
      const body = msg.message?.conversation
        ?? msg.message?.extendedTextMessage?.text
        ?? '';

      if (!body) continue;

      await supabase.from('channel_messages').insert({
        org_id: orgId,
        channel: 'whatsapp',
        external_id: msg.key.id,
        sender,
        body,
        received_at: new Date().toISOString(),
        metadata: { session_id: sessionId },
      }).then(({ error }) => {
        if (error) console.warn(`[${sessionId}] Failed to store message:`, error.message);
      });
    }
  });
}

// ─── Poll for pending sessions ─────────────────────────────────────────────

async function pollPendingSessions() {
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id, org_id, status')
    .eq('status', 'qr_pending');

  if (sessions) {
    for (const s of sessions) {
      if (!activeSockets.has(s.id)) {
        console.log(`[${s.id}] Starting new session for org ${s.org_id}`);
        startSession(s.id, s.org_id);
      }
    }
  }
}

// ─── Poll outbox for messages to send ──────────────────────────────────────

async function pollOutbox() {
  const { data: messages } = await supabase
    .from('whatsapp_outbox')
    .select('id, session_id, recipient, body')
    .eq('status', 'pending')
    .limit(20);

  if (!messages?.length) return;

  for (const msg of messages) {
    const sock = activeSockets.get(msg.session_id);
    if (!sock) {
      await supabase
        .from('whatsapp_outbox')
        .update({ status: 'error', error: 'Session not connected' })
        .eq('id', msg.id);
      continue;
    }

    try {
      const jid = msg.recipient.includes('@') ? msg.recipient : `${msg.recipient}@s.whatsapp.net`;
      await sock.sendMessage(jid, { text: msg.body });
      await supabase
        .from('whatsapp_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', msg.id);
    } catch (err: any) {
      await supabase
        .from('whatsapp_outbox')
        .update({ status: 'error', error: err.message ?? 'Unknown error' })
        .eq('id', msg.id);
    }
  }
}

// ─── Reconnect existing connected sessions on startup ──────────────────────

async function reconnectExisting() {
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id, org_id')
    .eq('status', 'connected');

  if (sessions) {
    for (const s of sessions) {
      const sessionDir = path.join(AUTH_DIR, s.id);
      if (fs.existsSync(sessionDir)) {
        console.log(`[${s.id}] Reconnecting existing session`);
        startSession(s.id, s.org_id);
      }
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('WhatsApp Bridge Worker starting...');

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  await reconnectExisting();

  // Poll loops
  setInterval(pollPendingSessions, POLL_INTERVAL_MS);
  setInterval(pollOutbox, OUTBOX_POLL_MS);

  console.log('WhatsApp Bridge Worker running');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
