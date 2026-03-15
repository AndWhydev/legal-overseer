#!/usr/bin/env bash
# =============================================================================
# BitBit — Backup & Infrastructure Health Verification
# =============================================================================
# Usage: ./personal-assistant/scripts/verify-backups.sh
#
# Requires:
#   - supabase CLI (logged in)
#   - fly CLI (logged in via FLY_API_TOKEN or `fly auth login`)
#   - curl
#   - jq (optional, for prettier output)
#
# Environment variables (optional — pulls from shell if already set):
#   SUPABASE_SERVICE_ROLE_KEY  — for direct DB health check
#   PINECONE_API_KEY           — for Pinecone index stats
#   PINECONE_INDEX_HOST        — e.g. https://bitbit-rag-xxxxx.svc.aped-xxxx.pinecone.io
# =============================================================================

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RESET='\033[0m'
BOLD='\033[1m'

pass()  { echo -e "  ${GREEN}[PASS]${RESET}  $1"; }
fail()  { echo -e "  ${RED}[FAIL]${RESET}  $1"; FAILED+=("$1"); }
warn()  { echo -e "  ${YELLOW}[WARN]${RESET}  $1"; }
info()  { echo -e "  ${BLUE}[INFO]${RESET}  $1"; }
header(){ echo -e "\n${BOLD}$1${RESET}"; echo "──────────────────────────────────────────────"; }

FAILED=()
SUPABASE_PROJECT="johvduasrhmufrfdxjus"
FLY_APP="bitbit-workers"
NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://${SUPABASE_PROJECT}.supabase.co}"

echo -e "\n${BOLD}BitBit — Infrastructure Health Check${RESET}"
echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "=============================================="

# =============================================================================
# 1. Supabase
# =============================================================================
header "1. Supabase (Primary Database)"

# 1a. Check Supabase REST API reachability
info "Checking Supabase REST endpoint..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 10 \
  "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/" \
  -H "apikey: ${SUPABASE_ANON_KEY:-placeholder}" 2>/dev/null || echo "000")

if [[ "$HTTP_STATUS" =~ ^(200|400|401|403)$ ]]; then
  pass "Supabase REST API reachable (HTTP $HTTP_STATUS)"
else
  fail "Supabase REST API unreachable (HTTP $HTTP_STATUS) — check https://status.supabase.com"
fi

# 1b. Check Supabase project status via CLI (if available)
if command -v supabase &>/dev/null; then
  info "Checking Supabase project status via CLI..."
  if supabase projects list 2>/dev/null | grep -q "$SUPABASE_PROJECT"; then
    pass "Supabase project $SUPABASE_PROJECT found in account"
  else
    warn "Could not verify project via CLI — run: supabase login"
  fi
else
  warn "Supabase CLI not found — install with: npm install -g supabase"
fi

# 1c. Backup availability (informational — requires dashboard)
info "Backup policy: Daily backups (7-day retention) + PITR on Pro plan"
info "Verify PITR window at: https://supabase.com/dashboard/project/${SUPABASE_PROJECT}/settings/infrastructure"

# =============================================================================
# 2. Fly.io Workers
# =============================================================================
header "2. Fly.io Workers (bitbit-workers)"

if command -v fly &>/dev/null; then
  info "Fetching machine status for app: $FLY_APP ..."

  # Get machine list and status
  FLY_STATUS=$(fly status --app "$FLY_APP" 2>&1 || true)

  if echo "$FLY_STATUS" | grep -q "running"; then
    RUNNING_COUNT=$(echo "$FLY_STATUS" | grep -c "running" || true)
    pass "Fly.io: $RUNNING_COUNT machine(s) in 'running' state"
  elif echo "$FLY_STATUS" | grep -q "stopped"; then
    warn "Fly.io: machines are stopped (auto-start should wake them on next request)"
  else
    fail "Fly.io: could not determine machine state — run: fly status --app $FLY_APP"
  fi

  # Check health endpoint directly
  info "Checking Fly.io worker health endpoint..."
  WORKER_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 15 \
    "https://${FLY_APP}.fly.dev/api/monitoring/health" 2>/dev/null || echo "000")

  if [[ "$WORKER_HTTP" == "200" ]]; then
    pass "Fly.io worker health check: HTTP 200"
  elif [[ "$WORKER_HTTP" == "000" ]]; then
    warn "Fly.io worker health check timed out (machines may be suspended — will auto-start)"
  else
    fail "Fly.io worker health check returned HTTP $WORKER_HTTP"
  fi
else
  warn "Fly CLI not found — install from: https://fly.io/docs/hands-on/install-flyctl/"
  info "Manually check: https://fly.io/apps/$FLY_APP"
fi

# =============================================================================
# 3. Pinecone Vector Store
# =============================================================================
header "3. Pinecone (Vector Store / RAG)"

if [[ -n "${PINECONE_API_KEY:-}" ]]; then
  info "Checking Pinecone index stats..."

  # Fetch index list to find the host
  PINECONE_LIST=$(curl -s --max-time 10 \
    "https://api.pinecone.io/indexes" \
    -H "Api-Key: $PINECONE_API_KEY" 2>/dev/null || echo "")

  INDEX_NAME="${PINECONE_INDEX_NAME:-bitbit-rag}"

  if echo "$PINECONE_LIST" | grep -q "\"$INDEX_NAME\""; then
    pass "Pinecone index '$INDEX_NAME' exists"

    # Get index host from list response (requires jq)
    if command -v jq &>/dev/null; then
      INDEX_HOST=$(echo "$PINECONE_LIST" | jq -r ".indexes[] | select(.name==\"$INDEX_NAME\") | .host" 2>/dev/null || echo "")

      if [[ -n "$INDEX_HOST" ]]; then
        # Fetch stats from the index host
        STATS=$(curl -s --max-time 10 \
          "https://${INDEX_HOST}/describe_index_stats" \
          -H "Api-Key: $PINECONE_API_KEY" 2>/dev/null || echo "")

        VECTOR_COUNT=$(echo "$STATS" | jq -r '.totalVectorCount // .namespaces[""].vectorCount // "unknown"' 2>/dev/null || echo "unknown")
        pass "Pinecone vector count: $VECTOR_COUNT"

        if [[ "$VECTOR_COUNT" == "0" ]] || [[ "$VECTOR_COUNT" == "null" ]]; then
          warn "Pinecone index is EMPTY — RAG will fall back to DB-only search"
          warn "Re-index: POST /api/workers/embed with backfill:true"
        fi
      fi
    else
      info "Install jq for detailed stats: apt-get install jq"
    fi
  elif echo "$PINECONE_LIST" | grep -q "\"indexes\""; then
    fail "Pinecone index '$INDEX_NAME' not found — index may need to be created"
  else
    fail "Pinecone API unreachable or API key invalid"
  fi
else
  warn "PINECONE_API_KEY not set — skipping Pinecone check"
  info "Set env var or run: export PINECONE_API_KEY=<your-key>"
fi

# =============================================================================
# 4. Vercel / App Endpoint
# =============================================================================
header "4. Vercel Dashboard (app.bitbit.chat)"

APP_URL="${NEXT_PUBLIC_APP_URL:-https://app.bitbit.chat}"
info "Checking app endpoint: $APP_URL ..."

APP_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 15 \
  "$APP_URL" 2>/dev/null || echo "000")

if [[ "$APP_HTTP" =~ ^(200|301|302)$ ]]; then
  pass "App is reachable (HTTP $APP_HTTP)"
else
  fail "App returned HTTP $APP_HTTP — check https://vercel.com/awu-team/bitbit/deployments"
fi

# Health API endpoint
HEALTH_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 15 \
  "$APP_URL/api/monitoring/health" 2>/dev/null || echo "000")

if [[ "$HEALTH_HTTP" == "200" ]]; then
  pass "App health endpoint: HTTP 200"
elif [[ "$HEALTH_HTTP" == "401" ]]; then
  warn "App health endpoint returned 401 (auth required — expected in production)"
else
  fail "App health endpoint returned HTTP $HEALTH_HTTP"
fi

# =============================================================================
# 5. Cloudflare Edge Cron
# =============================================================================
header "5. Cloudflare Edge Cron"

EDGE_URL="https://bitbit-edge-cron.bitbit-edge.workers.dev"
info "Checking Cloudflare Worker endpoint..."

EDGE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 10 \
  "$EDGE_URL/health" 2>/dev/null || echo "000")

if [[ "$EDGE_HTTP" =~ ^(200|401|404)$ ]]; then
  pass "Cloudflare Worker reachable (HTTP $EDGE_HTTP)"
else
  warn "Cloudflare Worker returned HTTP $EDGE_HTTP (may be normal if no /health route)"
  info "Check via: wrangler tail bitbit-edge-cron"
fi

# =============================================================================
# Summary
# =============================================================================
header "Summary"

if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}All checks passed.${RESET} Infrastructure is healthy."
else
  echo -e "${RED}${BOLD}${#FAILED[@]} check(s) FAILED:${RESET}"
  for item in "${FAILED[@]}"; do
    echo -e "  ${RED}x${RESET} $item"
  done
  echo ""
  echo -e "See ${BOLD}personal-assistant/docs/DISASTER_RECOVERY.md${RESET} for remediation steps."
  exit 1
fi

echo ""
echo "Backup resources:"
echo "  Supabase PITR:  https://supabase.com/dashboard/project/${SUPABASE_PROJECT}/settings/infrastructure"
echo "  Vercel deploys: https://vercel.com/awu-team/bitbit/deployments"
echo "  Fly.io status:  https://fly.io/apps/$FLY_APP"
echo "  Sentry:         https://bitbit-d1.sentry.io"
