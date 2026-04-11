# WhatsApp Production Setup Checklist

## Prerequisites

- [ ] Facebook Developer account
- [ ] Meta Business Suite account with verified business
- [ ] Deployed BitBit instance with public HTTPS URL

## 1. Meta Business Verification

1. Go to [Meta Business Suite](https://business.facebook.com/settings/info)
2. Navigate to **Settings > Business Info > Business Verification**
3. Submit required documents (business registration, utility bill, etc.)
4. Wait for approval (typically 1-5 business days)
5. Verification status must be **Verified** before going live

## 2. Create WhatsApp Business App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. **Create App** > Select **Business** type > Choose your verified business
3. Add the **WhatsApp** product to the app
4. Note your:
   - **App ID**
   - **Phone Number ID** (from WhatsApp > API Setup)
   - **WhatsApp Business Account ID**
   - **Permanent System User Token** (see Token Setup below)

## 3. Generate Permanent Access Token

1. Go to **Business Settings > System Users**
2. Create a system user with **Admin** role
3. Click **Generate Token** for your WhatsApp app
4. Select permissions: `whatsapp_business_management`, `whatsapp_business_messaging`
5. Copy the token and set as `WHATSAPP_ACCESS_TOKEN` in your environment

## 4. Webhook Registration

1. In the Facebook Developer dashboard, go to **WhatsApp > Configuration**
2. Set **Callback URL** to:
   ```
   https://your-domain.com/api/webhooks/whatsapp
   ```
3. Set **Verify Token** to match your `WHATSAPP_VERIFY_TOKEN` env var
4. Click **Verify and Save**
5. Subscribe to these webhook fields:
   - [x] `messages` (incoming messages)
   - [x] `message_deliveries` (delivery receipts)
   - [x] `message_reads` (read receipts)
   - [x] `messaging_postbacks` (button responses)

## 5. Test Number Setup

1. In **WhatsApp > API Setup**, use the provided test phone number for development
2. Add up to 5 recipient test numbers under **To** field
3. Send a test message using the API panel to verify connectivity
4. To use your own number:
   - Add a phone number under **WhatsApp > Phone Numbers**
   - Complete the verification (SMS/voice code)
   - Assign the number to your WhatsApp Business Account

## 6. Message Template Pre-Approval

WhatsApp requires pre-approved templates for business-initiated messages (outside 24h window).

### Required Templates

| Template Name | Category | Content |
|---|---|---|
| `morning_briefing` | UTILITY | Daily summary with task count, priority items |
| `approval_request` | UTILITY | Agent action requiring user approval with quick-reply buttons |
| `task_notification` | UTILITY | New task created or status changed |
| `invoice_reminder` | UTILITY | Invoice payment reminder with amount and due date |
| `lead_alert` | UTILITY | New lead notification with qualification score |

### Submitting Templates

1. Go to **WhatsApp > Message Templates** in Business Manager
2. Click **Create Template**
3. Select category (UTILITY for operational messages)
4. Set language to **English (US)**
5. Write template body with variable placeholders: `{{1}}`, `{{2}}`, etc.
6. Add quick-reply or call-to-action buttons as needed
7. Submit for review (typically approved within minutes for UTILITY)

### Example Template: `approval_request`

```
Category: UTILITY
Body: "Action required: {{1}} wants to {{2}}. Confidence: {{3}}%. Reply APPROVE or REJECT."
Buttons: [Quick Reply: "APPROVE", Quick Reply: "REJECT"]
```

## 7. Environment Variables

Set these in your deployment environment (Vercel / .env):

```bash
WHATSAPP_ACCESS_TOKEN=       # Permanent system user token
WHATSAPP_PHONE_NUMBER_ID=    # From API Setup page
WHATSAPP_VERIFY_TOKEN=       # Your chosen webhook verify string
WHATSAPP_BUSINESS_ACCOUNT_ID= # WABA ID
META_APP_SECRET=             # For webhook signature verification
```

## 8. Production Readiness Checks

- [ ] Business verification approved
- [ ] Webhook receiving messages (check logs)
- [ ] All message templates approved
- [ ] Webhook signature verification enabled (`META_APP_SECRET` set)
- [ ] Rate limits understood (1,000 business-initiated conversations/day initially)
- [ ] Fallback handling for template rejection or delivery failure
- [ ] Phone number display name approved
