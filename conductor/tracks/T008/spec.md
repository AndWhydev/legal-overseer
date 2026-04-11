# T008 — Platform OAuth App Registrations

## Overview

Register production OAuth applications with external service providers so that BitBit can connect to real user accounts. This is entirely human-gated work requiring browser logins, CAPTCHA solving, and credential management.

## Problem

All channel adapters are code-complete and tested with mocks, but none can connect to real accounts without registered OAuth apps and API credentials stored in the production environment.

## Tasks

### P0 — Revenue blockers

| # | Task | Owner | Effort | Status |
|---|------|-------|--------|--------|
| 1 | Fix Stripe identity verification (payouts paused) | Tor | 15 min | Blocked by CAPTCHA |
| 2 | Get Stripe API keys + configure webhook endpoint | Tor | 15 min | Needs browser login |
| 3 | Add STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET to Vercel env | Tor | 5 min | After #2 |

### P0 — WhatsApp (3-14 day blocker)

| # | Task | Owner | Effort | Status |
|---|------|-------|--------|--------|
| 4 | Create or verify Meta Business Account | Andy+Tor | 30 min | |
| 5 | Submit Meta Business Verification | Andy+Tor | 1 hr | |
| 6 | Wait for verification approval | — | 3-14 days | START FIRST |
| 7 | Create WhatsApp Business App in Meta Developer portal | Tor | 30 min | After #6 |
| 8 | Configure webhook + phone number | Tor | 30 min | After #7 |

### P1 — Core connections

| # | Task | Owner | Effort | Status |
|---|------|-------|--------|--------|
| 9 | Google OAuth consent screen (Gmail, Calendar, GSC, GA4) | Tor | 30 min | |
| 10 | Microsoft Azure AD app registration (Outlook Graph API) | Tor | 45 min | |
| 11 | Xero OAuth app registration | Tor | 30 min | |
| 12 | Slack app creation (Bot Token + Events API) | Tor | 30 min | |

### P2 — Andy's credentials

| # | Task | Owner | Effort | Status |
|---|------|-------|--------|--------|
| 13 | Obtain Andy's Asana PAT | Andy | 5 min | |
| 14 | Obtain Andy's Calendly API key | Andy | 5 min | |
| 15 | Obtain Andy's ClickUp API token | Andy | 5 min | |

### Verification

| # | Task | Effort |
|---|------|--------|
| 16 | Store all credentials via connections UI or org_integrations table | 30 min |
| 17 | Smoke test each channel adapter against real credentials | 2 hr |

## Acceptance Criteria

- [ ] Stripe accepting payments and processing webhooks
- [ ] WhatsApp Business API sending and receiving messages
- [ ] Google OAuth connecting Gmail, Calendar, GSC, GA4
- [ ] Microsoft Graph API connecting Outlook
- [ ] At least one adapter verified against real credentials per provider
- [ ] All API keys stored in Vercel environment variables

## Blockers

- Stripe: CAPTCHA on dashboard login (snail puzzle blocks headless automation)
- Meta: Business Verification is a 3-14 day wait
- No 1Password entries exist for Meta developers, Slack API, or Xero
