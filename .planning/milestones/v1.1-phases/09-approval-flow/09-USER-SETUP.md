# Phase 09 User Setup: WhatsApp Approval Flow

Status: Incomplete

## Service: WhatsApp Business API

Why needed: Send approval notifications to Andy and receive Y/N replies via webhook.

### Environment Variables

| Variable | Description | Where to get it |
| --- | --- | --- |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API phone number ID | Meta Business Suite -> WhatsApp -> API Setup -> Phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | Token for Graph API message send calls | Meta Business Suite -> WhatsApp -> API Setup -> Permanent token (or System User token) |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification shared secret | Self-generated random string |
| `WHATSAPP_ANDY_PHONE` | Andy's WhatsApp number | E.164 format, e.g. `+61412345678` |

### Dashboard Configuration Checklist

- [ ] Register webhook URL in Meta Business Suite:
  - `https://your-domain/api/channels/whatsapp/webhook`
- [ ] Subscribe webhook field:
  - `messages`

### Local Dev / Verification

1. Set the four WhatsApp environment variables and deploy/restart app.
2. Verify webhook challenge:
   - `GET /api/channels/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test`
   - Expected body: `test`
3. Trigger an approval flow and verify Andy receives WhatsApp message.
4. Reply `Y` or `N` from Andy's number and verify approval status updates to resolved via `whatsapp`.
