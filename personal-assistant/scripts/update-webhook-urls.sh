#!/usr/bin/env bash
# =============================================================================
# BitBit — Update Webhook URLs to app.bitbit.chat
# =============================================================================
# Run this AFTER the custom domain is live and SSL is confirmed.
#
# Usage:
#   ./personal-assistant/scripts/update-webhook-urls.sh [--dry-run]
#
# Prerequisites:
#   - STRIPE_SECRET_KEY env var (or loaded from .env.local)
#   - TELNYX_API_KEY env var
#   - WHATSAPP_ACCESS_TOKEN env var (Meta Graph API)
#   - curl, jq
#
# What it updates:
#   1. Stripe webhook endpoint URL
#   2. Telnyx messaging profile webhook URL
#   3. Meta (WhatsApp) webhook subscription
#
# Google OAuth is NOT updated here — that requires the browser console.
# See PRE_LAUNCH_CHECKLIST.md Task #70 Step 6 for manual instructions.
# =============================================================================

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
NEW_DOMAIN="https://app.bitbit.chat"
OLD_DOMAIN="https://bitbit.vercel.app"

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "DRY RUN mode — no changes will be made"
fi

# ── Colour helpers ─────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RESET='\033[0m'
BOLD='\033[1m'

ok()   { echo -e "  ${GREEN}[OK]${RESET}    $1"; }
fail() { echo -e "  ${RED}[FAIL]${RESET}  $1"; }
warn() { echo -e "  ${YELLOW}[WARN]${RESET}  $1"; }
info() { echo -e "  ${BLUE}[INFO]${RESET}  $1"; }
dry()  { echo -e "  ${YELLOW}[DRY]${RESET}   Would run: $1"; }

echo -e "\n${BOLD}BitBit — Webhook URL Migration${RESET}"
echo "From: $OLD_DOMAIN"
echo "To:   $NEW_DOMAIN"
echo "────────────────────────────────────────────────"

# Load .env.local if present and env vars not already set
if [[ -f "personal-assistant/.env.local" ]]; then
  info "Loading personal-assistant/.env.local ..."
  set -o allexport
  # shellcheck disable=SC1091
  source personal-assistant/.env.local 2>/dev/null || true
  set +o allexport
fi

# =============================================================================
# 1. Stripe
# =============================================================================
echo -e "\n${BOLD}1. Stripe Webhook${RESET}"
echo "   Endpoint: $NEW_DOMAIN/api/webhooks/stripe"

if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
  warn "STRIPE_SECRET_KEY not set — skipping Stripe update"
  warn "Manual: https://dashboard.stripe.com/webhooks"
else
  info "Listing current Stripe webhook endpoints..."

  WEBHOOKS=$(curl -s --max-time 15 \
    "https://api.stripe.com/v1/webhook_endpoints?limit=20" \
    -u "${STRIPE_SECRET_KEY}:" 2>/dev/null || echo "")

  if command -v jq &>/dev/null && echo "$WEBHOOKS" | jq -e '.data' &>/dev/null; then
    # Find the endpoint that matches the old or new domain
    ENDPOINT_ID=$(echo "$WEBHOOKS" | jq -r \
      '.data[] | select(.url | (contains("bitbit.vercel.app") or contains("app.bitbit.chat"))) | .id' \
      2>/dev/null | head -1 || echo "")

    CURRENT_URL=$(echo "$WEBHOOKS" | jq -r \
      ".data[] | select(.id==\"$ENDPOINT_ID\") | .url" 2>/dev/null || echo "")

    if [[ -n "$ENDPOINT_ID" ]]; then
      info "Found endpoint: $ENDPOINT_ID (currently: $CURRENT_URL)"

      if [[ "$CURRENT_URL" == "$NEW_DOMAIN/api/webhooks/stripe" ]]; then
        ok "Stripe webhook URL is already correct — no update needed"
      else
        if [[ "$DRY_RUN" == true ]]; then
          dry "curl -s -X POST https://api.stripe.com/v1/webhook_endpoints/$ENDPOINT_ID -d url=$NEW_DOMAIN/api/webhooks/stripe"
        else
          UPDATE=$(curl -s --max-time 15 \
            -X POST "https://api.stripe.com/v1/webhook_endpoints/$ENDPOINT_ID" \
            -u "${STRIPE_SECRET_KEY}:" \
            --data-urlencode "url=${NEW_DOMAIN}/api/webhooks/stripe" 2>/dev/null || echo "")

          UPDATED_URL=$(echo "$UPDATE" | jq -r '.url' 2>/dev/null || echo "")
          if [[ "$UPDATED_URL" == "${NEW_DOMAIN}/api/webhooks/stripe" ]]; then
            ok "Stripe webhook URL updated: $UPDATED_URL"
          else
            fail "Stripe update may have failed. Response: $(echo "$UPDATE" | jq -r '.error.message // "unknown"' 2>/dev/null)"
          fi
        fi
      fi
    else
      warn "No Stripe endpoint found matching bitbit.vercel.app or app.bitbit.chat"
      warn "List all: curl https://api.stripe.com/v1/webhook_endpoints -u \$STRIPE_SECRET_KEY:"
      warn "Create manually: https://dashboard.stripe.com/webhooks"
    fi
  else
    fail "Stripe API call failed or jq not installed (install jq for parsing)"
    warn "Manual: https://dashboard.stripe.com/webhooks → update to $NEW_DOMAIN/api/webhooks/stripe"
  fi
fi

# =============================================================================
# 2. Telnyx
# =============================================================================
echo -e "\n${BOLD}2. Telnyx Messaging Profile Webhook${RESET}"
echo "   Endpoint: $NEW_DOMAIN/api/webhooks/sms"

# Profile ID from MEMORY.md (BitBit profile)
TELNYX_PROFILE_ID="${TELNYX_MESSAGING_PROFILE_ID:-40019cd1-931e-4520-8005-ff66aeb78458}"

if [[ -z "${TELNYX_API_KEY:-}" ]]; then
  warn "TELNYX_API_KEY not set — skipping Telnyx update"
  warn "Manual: https://portal.telnyx.com/#/app/messaging → Messaging Profiles"
else
  info "Fetching Telnyx messaging profile: $TELNYX_PROFILE_ID ..."

  PROFILE=$(curl -s --max-time 15 \
    "https://api.telnyx.com/v2/messaging_profiles/$TELNYX_PROFILE_ID" \
    -H "Authorization: Bearer $TELNYX_API_KEY" 2>/dev/null || echo "")

  CURRENT_WEBHOOK=$(echo "$PROFILE" | python3 -c \
    "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('webhook_url',''))" \
    2>/dev/null || echo "")

  if [[ -n "$CURRENT_WEBHOOK" ]]; then
    info "Current webhook URL: $CURRENT_WEBHOOK"

    if [[ "$CURRENT_WEBHOOK" == "${NEW_DOMAIN}/api/webhooks/sms" ]]; then
      ok "Telnyx webhook URL is already correct — no update needed"
    else
      if [[ "$DRY_RUN" == true ]]; then
        dry "PATCH https://api.telnyx.com/v2/messaging_profiles/$TELNYX_PROFILE_ID {webhook_url: $NEW_DOMAIN/api/webhooks/sms}"
      else
        UPDATE=$(curl -s --max-time 15 \
          -X PATCH "https://api.telnyx.com/v2/messaging_profiles/$TELNYX_PROFILE_ID" \
          -H "Authorization: Bearer $TELNYX_API_KEY" \
          -H "Content-Type: application/json" \
          -d "{\"webhook_url\": \"${NEW_DOMAIN}/api/webhooks/sms\", \"webhook_failover_url\": \"\"}" \
          2>/dev/null || echo "")

        UPDATED_WEBHOOK=$(echo "$UPDATE" | python3 -c \
          "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('webhook_url','error'))" \
          2>/dev/null || echo "error")

        if [[ "$UPDATED_WEBHOOK" == "${NEW_DOMAIN}/api/webhooks/sms" ]]; then
          ok "Telnyx webhook URL updated: $UPDATED_WEBHOOK"
        else
          fail "Telnyx update may have failed. Run manually in portal.telnyx.com"
        fi
      fi
    fi
  else
    fail "Could not fetch Telnyx profile (API key may be wrong, or profile ID changed)"
    warn "Profile ID in use: $TELNYX_PROFILE_ID"
    warn "Manual: https://portal.telnyx.com/#/app/messaging → Messaging Profiles → Edit"
  fi
fi

# =============================================================================
# 3. Meta (WhatsApp) Webhook
# =============================================================================
echo -e "\n${BOLD}3. Meta / WhatsApp Webhook${RESET}"
echo "   Endpoint: $NEW_DOMAIN/api/channels/whatsapp"

# App ID from MEMORY.md: Google OAuth project 163710351496 — but WhatsApp app ID is separate
# From MEMORY.md: webhook was configured via Graph API
WHATSAPP_APP_ID="${WHATSAPP_APP_ID:-}"
META_APP_ACCESS_TOKEN="${WHATSAPP_ACCESS_TOKEN:-}"

if [[ -z "$META_APP_ACCESS_TOKEN" ]]; then
  warn "WHATSAPP_ACCESS_TOKEN not set — skipping Meta webhook update"
  warn "Note: this token is also EXPIRED per MEMORY.md — renew first"
  warn "Manual steps:"
  warn "  1. Get a new System User token from business.facebook.com/settings/system-users"
  warn "  2. Then update webhook:"
  warn "     curl -X POST 'https://graph.facebook.com/v18.0/<APP_ID>/subscriptions' \\"
  warn "       --data 'object=whatsapp_business_account' \\"
  warn "       --data 'callback_url=${NEW_DOMAIN}/api/channels/whatsapp' \\"
  warn "       --data 'verify_token=\$WHATSAPP_VERIFY_TOKEN' \\"
  warn "       --data 'fields=messages' \\"
  warn "       -H 'Authorization: Bearer <APP_ACCESS_TOKEN>'"
else
  if [[ -z "$WHATSAPP_APP_ID" ]]; then
    warn "WHATSAPP_APP_ID not set — cannot update Meta webhook via API"
    warn "Set WHATSAPP_APP_ID and re-run, or update manually at developers.facebook.com"
  else
    info "Updating Meta webhook subscription for app $WHATSAPP_APP_ID ..."

    VERIFY_TOKEN="${WHATSAPP_VERIFY_TOKEN:-bitbit-verify}"

    if [[ "$DRY_RUN" == true ]]; then
      dry "POST https://graph.facebook.com/v18.0/$WHATSAPP_APP_ID/subscriptions"
      dry "  callback_url: $NEW_DOMAIN/api/channels/whatsapp"
      dry "  fields: messages"
    else
      UPDATE=$(curl -s --max-time 15 \
        -X POST "https://graph.facebook.com/v18.0/${WHATSAPP_APP_ID}/subscriptions" \
        -H "Authorization: Bearer $META_APP_ACCESS_TOKEN" \
        -d "object=whatsapp_business_account" \
        --data-urlencode "callback_url=${NEW_DOMAIN}/api/channels/whatsapp" \
        -d "verify_token=${VERIFY_TOKEN}" \
        -d "fields=messages" 2>/dev/null || echo "")

      if echo "$UPDATE" | grep -q '"success":true'; then
        ok "Meta webhook subscription updated to $NEW_DOMAIN/api/channels/whatsapp"
      else
        fail "Meta webhook update failed: $UPDATE"
        warn "Manual: developers.facebook.com → App → WhatsApp → Configuration → Edit webhook"
      fi
    fi
  fi
fi

# =============================================================================
# 4. Google OAuth (manual — informational only)
# =============================================================================
echo -e "\n${BOLD}4. Google OAuth Redirect URIs${RESET}"
warn "Google OAuth redirect URIs must be updated MANUALLY in the browser"
info "Instructions:"
info "  1. Go to: https://console.cloud.google.com/apis/credentials"
info "  2. Project: ThorTech Computers (163710351496)"
info "  3. Edit the OAuth 2.0 Client"
info "  4. Add to Authorised JavaScript origins:"
info "       ${NEW_DOMAIN}"
info "  5. Add to Authorised redirect URIs:"
info "       ${NEW_DOMAIN}/api/auth/callback/google"
info "       ${NEW_DOMAIN}/api/connections/google/callback"
info "  6. Save"

# =============================================================================
# 5. Summary
# =============================================================================
echo -e "\n${BOLD}Summary${RESET}"
echo "────────────────────────────────────────────────"
if [[ "$DRY_RUN" == true ]]; then
  warn "This was a DRY RUN — no changes were made"
  info "Re-run without --dry-run to apply changes"
else
  info "Webhook URL migration complete."
  info "Remaining manual step: Google OAuth console (see above)"
fi

echo ""
echo "After all webhooks are updated:"
echo "  1. Verify Stripe: https://dashboard.stripe.com/webhooks"
echo "  2. Send a test SMS via Telnyx portal to confirm delivery"
echo "  3. Send a test WhatsApp message (after token is renewed)"
echo "  4. Test Google OAuth flow: ${NEW_DOMAIN}/api/auth/callback/google"
echo ""
