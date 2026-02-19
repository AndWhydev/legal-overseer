#!/usr/bin/env tsx
/**
 * ClickUp Webhook Registration Script
 *
 * Registers a webhook endpoint with ClickUp API to receive task events.
 *
 * Usage:
 *   npm run clickup:register -- https://bitbit-cheekyglo.fly.dev/clickup/webhook
 *
 * Environment variables required:
 *   CLICKUP_API_KEY - Your ClickUp API token
 *   CLICKUP_TEAM_ID - Your ClickUp team/workspace ID
 *
 * On success, outputs the webhook secret to add to .env:
 *   CLICKUP_WEBHOOK_SECRET=<secret>
 */

const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY;
const CLICKUP_TEAM_ID = process.env.CLICKUP_TEAM_ID;

// Get webhook URL from CLI args or environment
const webhookUrl = process.argv[2] || process.env.CLICKUP_WEBHOOK_URL;

if (!CLICKUP_API_KEY) {
  console.error('Error: CLICKUP_API_KEY environment variable is required');
  console.error('Get your API key from: https://app.clickup.com/settings/apps');
  process.exit(1);
}

if (!CLICKUP_TEAM_ID) {
  console.error('Error: CLICKUP_TEAM_ID environment variable is required');
  console.error('Find your team ID in ClickUp settings or URL');
  process.exit(1);
}

if (!webhookUrl) {
  console.error('Error: Webhook URL is required');
  console.error('');
  console.error('Usage: npm run clickup:register -- <webhook-url>');
  console.error('');
  console.error('Example:');
  console.error('  npm run clickup:register -- https://bitbit-cheekyglo.fly.dev/clickup/webhook');
  console.error('');
  console.error('Or set CLICKUP_WEBHOOK_URL environment variable');
  process.exit(1);
}

interface ClickUpWebhookResponse {
  id: string;
  webhook: {
    id: string;
    endpoint: string;
    events: string[];
    secret: string;
  };
}

interface ClickUpErrorResponse {
  err: string;
  ECODE: string;
}

async function registerWebhook(): Promise<void> {
  console.log('Registering ClickUp webhook...');
  console.log(`  Team ID: ${CLICKUP_TEAM_ID}`);
  console.log(`  Endpoint: ${webhookUrl}`);
  console.log('');

  const events = [
    'taskStatusUpdated',
    'taskCreated',
    'taskUpdated',
    'taskCommentPosted',
  ];

  const response = await fetch(
    `https://api.clickup.com/api/v2/team/${CLICKUP_TEAM_ID}/webhook`,
    {
      method: 'POST',
      headers: {
        'Authorization': CLICKUP_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: webhookUrl,
        events,
      }),
    }
  );

  const data = (await response.json()) as ClickUpWebhookResponse | ClickUpErrorResponse;

  if (!response.ok) {
    const errorData = data as ClickUpErrorResponse;
    console.error('Failed to register webhook:');
    console.error(`  Status: ${response.status} ${response.statusText}`);
    console.error(`  Error: ${errorData.err || JSON.stringify(data)}`);
    if (errorData.ECODE) {
      console.error(`  Code: ${errorData.ECODE}`);
    }
    process.exit(1);
  }

  const successData = data as ClickUpWebhookResponse;
  const webhook = successData.webhook;

  console.log('✓ Webhook registered successfully!');
  console.log('');
  console.log('Webhook details:');
  console.log(`  ID: ${webhook.id}`);
  console.log(`  Endpoint: ${webhook.endpoint}`);
  console.log(`  Events: ${webhook.events.join(', ')}`);
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('Add the following to your .env file:');
  console.log('');
  console.log(`CLICKUP_WEBHOOK_SECRET=${webhook.secret}`);
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('');
  console.log('For Fly.io deployment, set the secret:');
  console.log(`  fly secrets set CLICKUP_WEBHOOK_SECRET="${webhook.secret}"`);
}

registerWebhook().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
