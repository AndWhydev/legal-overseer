// Consolidated into /api/billing/webhook -- this route preserved for backwards compatibility
// during migration. Any existing Stripe webhook configuration pointing to /api/webhooks/stripe
// will continue to work.
export { POST } from '@/app/api/billing/webhook/route'
