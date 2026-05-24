/**
 * 9.6 — REST API for external integrations.
 *
 * /api/v1/* endpoints. API-key authenticated. Full CRUD on matters,
 * clients, documents, tasks; webhook subscription endpoints. OpenAPI
 * 3.0 spec available at /api/docs.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticateApiKey, logApiRequest, type ApiKey } from './keys.js';
import { getMatterById, listMatters, createMatter, updateMatter, nextMatterNumber } from '../db/repositories/matters.js';
import { listClients, createClient as createClientRecord, getClient } from '../clients/repo.js';
import { listMatterDocuments, getDocument } from '../uploads/store.js';
import { subscribe, unsubscribe, type WebhookEvent } from '../integrations/zapier/index.js';

export interface ApiResult {
  status: number;
  body: unknown;
}

export interface AuthedRequest {
  apiKey: ApiKey;
  body: unknown;
  method: string;
  path: string;
  query: URLSearchParams;
}

function unauth(): ApiResult {
  return { status: 401, body: { error: 'unauthorized' } };
}

function notFound(): ApiResult {
  return { status: 404, body: { error: 'not_found' } };
}

function bad(msg: string): ApiResult {
  return { status: 400, body: { error: msg } };
}

function ok(data: unknown): ApiResult {
  return { status: 200, body: data };
}

function readApiKey(req: IncomingMessage): string | null {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7).trim();
  const xkey = req.headers['x-api-key'];
  if (typeof xkey === 'string' && xkey.length) return xkey.trim();
  return null;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function dispatch(req: AuthedRequest): Promise<ApiResult> {
  const path = req.path;
  // ---- matters ----
  if (req.method === 'GET' && path === '/api/v1/matters') {
    return ok({ matters: listMatters() });
  }
  if (req.method === 'POST' && path === '/api/v1/matters') {
    const b = req.body as { title?: string; client_name?: string; matter_type?: string; client_email?: string; jurisdiction?: string };
    if (!b?.title || !b.client_name || !b.matter_type) return bad('title, client_name, matter_type required');
    const matter = createMatter({
      matter_number: nextMatterNumber(),
      title: b.title,
      client_name: b.client_name,
      client_email: b.client_email,
      matter_type: b.matter_type,
      jurisdiction: b.jurisdiction ?? process.env.DEFAULT_JURISDICTION ?? 'NSW',
      responsible_lawyer_email: null,
    });
    return { status: 201, body: matter };
  }
  let m = path.match(/^\/api\/v1\/matters\/([0-9a-f-]+)$/i);
  if (m) {
    const matter = getMatterById(m[1]);
    if (!matter) return notFound();
    if (req.method === 'GET') return ok(matter);
    if (req.method === 'PATCH') {
      const updated = updateMatter(m[1], req.body as Parameters<typeof updateMatter>[1]);
      return ok(updated);
    }
  }

  // ---- clients ----
  if (req.method === 'GET' && path === '/api/v1/clients') return ok({ clients: listClients() });
  if (req.method === 'POST' && path === '/api/v1/clients') {
    const b = req.body as { full_name?: string; email?: string; client_type?: 'individual' | 'company' | 'trust' | 'government' };
    if (!b?.full_name) return bad('full_name required');
    const c = createClientRecord({
      full_name: b.full_name,
      email: b.email,
      client_type: b.client_type,
      acting: `api:${req.apiKey.key_prefix}`,
    });
    return { status: 201, body: c };
  }
  m = path.match(/^\/api\/v1\/clients\/([0-9a-f-]+)$/i);
  if (m && req.method === 'GET') {
    const c = getClient(m[1]);
    if (!c) return notFound();
    return ok(c);
  }

  // ---- documents ----
  m = path.match(/^\/api\/v1\/matters\/([0-9a-f-]+)\/documents$/i);
  if (m && req.method === 'GET') {
    if (!getMatterById(m[1])) return notFound();
    return ok({ documents: listMatterDocuments(m[1]) });
  }
  m = path.match(/^\/api\/v1\/matters\/([0-9a-f-]+)\/documents\/([0-9a-f-]+)$/i);
  if (m && req.method === 'GET') {
    const doc = getDocument(m[1], m[2]);
    if (!doc) return notFound();
    return ok(doc);
  }

  // ---- webhooks ----
  if (req.method === 'GET' && path === '/api/v1/webhooks') {
    const { listSubscriptions } = await import('../integrations/zapier/index.js');
    return ok({ subscriptions: listSubscriptions(req.apiKey.id) });
  }
  if (req.method === 'POST' && path === '/api/v1/webhooks') {
    const b = req.body as { event: WebhookEvent; endpoint_url: string; secret?: string };
    if (!b?.event || !b.endpoint_url) return bad('event and endpoint_url required');
    const sub = subscribe({ apiKeyId: req.apiKey.id, eventKind: b.event, endpointUrl: b.endpoint_url, secret: b.secret });
    return { status: 201, body: sub };
  }
  m = path.match(/^\/api\/v1\/webhooks\/([0-9a-f-]+)$/i);
  if (m && req.method === 'DELETE') {
    unsubscribe(m[1]);
    return ok({ revoked: true });
  }

  return notFound();
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = (req.url ?? '').split('?')[0];
  if (!path.startsWith('/api/v1/') && path !== '/api/docs' && path !== '/api/docs/explorer') return false;

  const start = Date.now();
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown';

  if (path === '/api/docs') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(openApiSpec(), null, 2));
    logApiRequest(null, req.method ?? 'GET', path, 200, Date.now() - start, ip);
    return true;
  }
  if (path === '/api/docs/explorer') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(swaggerHtml());
    logApiRequest(null, req.method ?? 'GET', path, 200, Date.now() - start, ip);
    return true;
  }

  const plaintext = readApiKey(req);
  const apiKey = plaintext ? authenticateApiKey(plaintext) : null;
  if (!apiKey) {
    const r = unauth();
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.body));
    logApiRequest(null, req.method ?? 'GET', path, r.status, Date.now() - start, ip);
    return true;
  }

  const body = await readJsonBody(req);
  const url = new URL(req.url ?? '/', 'http://x');
  const result = await dispatch({
    apiKey,
    body,
    method: req.method ?? 'GET',
    path,
    query: url.searchParams,
  });
  res.writeHead(result.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(result.body));
  logApiRequest(apiKey.id, req.method ?? 'GET', path, result.status, Date.now() - start, ip);
  return true;
}

function openApiSpec(): unknown {
  return {
    openapi: '3.0.0',
    info: { title: 'Legal Overseer REST API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        bearer: { type: 'http', scheme: 'bearer' },
      },
    },
    security: [{ apiKey: [] }, { bearer: [] }],
    paths: {
      '/matters': {
        get: { summary: 'List matters', responses: { '200': { description: 'OK' } } },
        post: { summary: 'Create matter', responses: { '201': { description: 'Created' } } },
      },
      '/matters/{id}': {
        get: { summary: 'Get matter by id', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
        patch: { summary: 'Update matter', responses: { '200': { description: 'OK' } } },
      },
      '/clients': {
        get: { summary: 'List clients', responses: { '200': { description: 'OK' } } },
        post: { summary: 'Create client', responses: { '201': { description: 'Created' } } },
      },
      '/matters/{id}/documents': {
        get: { summary: 'List documents on a matter', responses: { '200': { description: 'OK' } } },
      },
      '/webhooks': {
        get: { summary: 'List webhook subscriptions for the calling API key', responses: { '200': { description: 'OK' } } },
        post: { summary: 'Create a webhook subscription', responses: { '201': { description: 'Created' } } },
      },
    },
  };
}

function swaggerHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Legal Overseer API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head><body><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.onload=function(){SwaggerUIBundle({url:'/api/docs',dom_id:'#ui'});}</script>
</body></html>`;
}
