#!/bin/bash
# Dev Cron Runner — hits critical cron endpoints on schedule.
# Run via: nohup bash scripts/dev-cron-runner.sh &
# Stop via: kill $(cat /tmp/bitbit-cron.pid)

APP_URL="http://localhost:3000"
CRON_SECRET="dh8kqvv1MKkuqT+RhVVU2H04Ms+haRjWQxOLekdb0AE="
AUTH="Authorization: Bearer ${CRON_SECRET}"
LOG="/tmp/bitbit-cron.log"

echo $$ > /tmp/bitbit-cron.pid
echo "[$(date)] Dev cron runner started (PID $$)" >> $LOG

hit() {
  local path=$1
  local result=$(curl -s -m 120 -o /dev/null -w "%{http_code}" -H "$AUTH" "${APP_URL}${path}")
  echo "[$(date)] ${path} -> ${result}" >> $LOG
}

COUNTER=0
while true; do
  COUNTER=$((COUNTER + 1))

  # Every 1 min: scheduler (agent tick)
  hit "/api/cron/scheduler"

  # Every 5 min: channel-sync, sentry, embeddings, role-tick
  if [ $((COUNTER % 5)) -eq 0 ]; then
    hit "/api/cron/channel-sync"
    hit "/api/cron/sentry" &
    hit "/api/cron/process-embeddings" &
    hit "/api/cron/role-tick" &
  fi

  # Every 15 min: proactive-alerts, archive-threads
  if [ $((COUNTER % 15)) -eq 0 ]; then
    hit "/api/cron/proactive-alerts" &
    hit "/api/cron/proactive-intelligence" &
    hit "/api/cron/archive-threads" &
  fi

  # Every 2 hours (120 min): intelligence, sleep-compute, entity-profile-refresh
  if [ $((COUNTER % 120)) -eq 0 ]; then
    hit "/api/cron/intelligence" &
    hit "/api/cron/sleep-compute" &
    hit "/api/cron/entity-profile-refresh" &
  fi

  # Daily at ~3am UTC (counter reset after 1440 min = 24h)
  if [ $COUNTER -ge 1440 ]; then
    hit "/api/cron/consolidation" &
    hit "/api/cron/relationship-health" &
    hit "/api/cron/calibrate-confidence" &
    hit "/api/cron/memory-consolidation" &
    hit "/api/cron/sleep-consolidation" &
    hit "/api/cron/billing" &
    hit "/api/cron/calibrate-confidence" &
    hit "/api/cron/sentiment-drift" &
    hit "/api/cron/revenue-intelligence" &

    # Weekly: only on Mondays (day 1)
    if [ "$(date +%u)" -eq 1 ]; then
      hit "/api/cron/weekly-report" &
    fi

    COUNTER=0
  fi

  sleep 60
done
