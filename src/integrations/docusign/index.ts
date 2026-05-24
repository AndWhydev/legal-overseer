/**
 * 7.2 — DocuSign integration.
 *
 * Optional. Replaces the built-in e-signature when configured. Same
 * provider seam: envelope.provider='docusign' routes to this module
 * instead of the built-in flow.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../../db/connection.js';
import { createSafeLogger } from '../../governance/index.js';
import { appendLegalAudit } from '../../compliance/audit.js';
import {
  createSignatureEnvelope,
  addSigner,
  getEnvelope,
  recordSignature,
} from '../../documents/esignature.js';

const logger = createSafeLogger('DocuSign');

export interface DocuSignConfig {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  baseUri: string;
  tokenExpiresAt: string;
}

function loadConfig(): DocuSignConfig | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT config_json FROM integration_configs WHERE provider = 'docusign' AND enabled = 1`)
    .get() as { config_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.config_json) as DocuSignConfig;
  } catch {
    return null;
  }
}

export function saveDocuSignConfig(config: DocuSignConfig, acting: string): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO integration_configs (id, provider, config_json, enabled, updated_at)
     VALUES (COALESCE((SELECT id FROM integration_configs WHERE provider = 'docusign'), ?), 'docusign', ?, 1, ?)`,
  ).run(randomUUID(), JSON.stringify(config), new Date().toISOString());
  appendLegalAudit({
    matterId: null,
    actorId: acting,
    action: 'docusign.configure',
    detail: config.accountId,
    refTable: 'integration_configs',
    refId: null,
  });
}

export function isDocuSignConfigured(): boolean {
  return loadConfig() !== null;
}

export interface SendDocuSignEnvelopeInput {
  matterId: string | null;
  documentId: string;
  documentTitle: string;
  documentBase64: string;
  signers: { name: string; email: string; role: string }[];
  createdBy: string;
}

interface DocuSignCreateResponse {
  envelopeId: string;
  status: string;
}

export async function sendDocuSignEnvelope(input: SendDocuSignEnvelopeInput): Promise<{ ok: boolean; envelopeId?: string; error?: string }> {
  const config = loadConfig();
  if (!config) {
    // Fall back to built-in.
    const env = createSignatureEnvelope({
      matterId: input.matterId,
      documentId: input.documentId,
      documentTitle: input.documentTitle,
      createdBy: input.createdBy,
      provider: 'builtin',
    });
    for (const s of input.signers) {
      addSigner({ envelopeId: env.id, signerName: s.name, signerEmail: s.email, role: s.role });
    }
    return { ok: true, envelopeId: env.id };
  }

  const localEnv = createSignatureEnvelope({
    matterId: input.matterId,
    documentId: input.documentId,
    documentTitle: input.documentTitle,
    createdBy: input.createdBy,
    provider: 'docusign',
  });

  const payload = {
    emailSubject: input.documentTitle,
    documents: [
      {
        documentBase64: input.documentBase64,
        name: input.documentTitle,
        fileExtension: 'pdf',
        documentId: '1',
      },
    ],
    recipients: {
      signers: input.signers.map((s, i) => ({
        email: s.email,
        name: s.name,
        recipientId: `${i + 1}`,
        routingOrder: '1',
        tabs: {
          signHereTabs: [{ documentId: '1', pageNumber: '1', xPosition: '100', yPosition: '600' }],
        },
      })),
    },
    status: 'sent',
  };

  try {
    const res = await fetch(`${config.baseUri}/v2.1/accounts/${config.accountId}/envelopes`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error(`docusign envelope create failed: HTTP ${res.status} ${text.slice(0, 240)}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as DocuSignCreateResponse;
    const db = getDatabase();
    db.prepare(
      `UPDATE signature_envelopes SET provider_envelope_id = ?, status = 'sent' WHERE id = ?`,
    ).run(data.envelopeId, localEnv.id);
    for (const s of input.signers) {
      addSigner({ envelopeId: localEnv.id, signerName: s.name, signerEmail: s.email, role: s.role });
    }
    appendLegalAudit({
      matterId: input.matterId,
      actorId: input.createdBy,
      action: 'docusign.envelope_sent',
      detail: input.documentTitle,
      refTable: 'signature_envelopes',
      refId: localEnv.id,
      metadata: { docusignEnvelopeId: data.envelopeId },
    });
    return { ok: true, envelopeId: localEnv.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Webhook handler for DocuSign envelope events. Marks signers complete
 * and the envelope completed when DocuSign reports the envelope as
 * "completed".
 */
export function handleDocuSignWebhook(payload: {
  envelopeId?: string;
  status?: string;
  recipients?: { signers?: { email: string; status: string }[] };
}): void {
  if (!payload.envelopeId) return;
  const db = getDatabase();
  const env = db
    .prepare(`SELECT * FROM signature_envelopes WHERE provider_envelope_id = ?`)
    .get(payload.envelopeId) as { id: string; matter_id: string | null; status: string } | undefined;
  if (!env) return;
  for (const s of payload.recipients?.signers ?? []) {
    if (s.status !== 'completed') continue;
    const signer = db
      .prepare(`SELECT signing_token FROM signature_signers WHERE envelope_id = ? AND signer_email = ?`)
      .get(env.id, s.email) as { signing_token: string } | undefined;
    if (signer) {
      try {
        recordSignature({
          signingToken: signer.signing_token,
          signatureData: 'docusign-completed',
          signedIp: 'docusign-webhook',
        });
      } catch { /* already signed */ }
    }
  }
  if (payload.status === 'completed') {
    db.prepare(`UPDATE signature_envelopes SET status = 'completed', completed_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      env.id,
    );
    appendLegalAudit({
      matterId: env.matter_id,
      actorId: 'docusign-webhook',
      action: 'docusign.envelope_completed',
      detail: payload.envelopeId,
      refTable: 'signature_envelopes',
      refId: env.id,
    });
  }
}

void getEnvelope;
