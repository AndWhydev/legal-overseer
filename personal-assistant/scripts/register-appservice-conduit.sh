#!/bin/bash
# Register a bridge appservice with Conduit
# Usage: ./register-appservice-conduit.sh <conduit-url> <admin-token> <registration.yaml>
#
# Conduit registers appservices via admin room messages, not via HTTP API or config file.
# This script finds the #admins room and sends the register-appservice command.
#
# Example:
#   ./scripts/register-appservice-conduit.sh \
#     https://bitbit-conduit.fly.dev \
#     syt_YourAdminToken \
#     /tmp/registration.yaml

set -e

CONDUIT_URL="${1:?Usage: $0 <conduit-url> <admin-token> <registration.yaml>}"
ADMIN_TOKEN="${2:?Usage: $0 <conduit-url> <admin-token> <registration.yaml>}"
REG_FILE="${3:?Usage: $0 <conduit-url> <admin-token> <registration.yaml>}"

if [ ! -f "$REG_FILE" ]; then
  echo "Error: Registration file not found: $REG_FILE"
  exit 1
fi

echo "Registering appservice from: $REG_FILE"
echo "Conduit: $CONDUIT_URL"

# Extract server name from URL (e.g. https://bitbit-conduit.fly.dev -> bitbit-conduit.fly.dev)
SERVER_NAME=$(echo "$CONDUIT_URL" | sed 's|https\?://||' | sed 's|/.*||')

# Look up the admin room ID via alias #admins:<server>
ADMIN_ROOM=$(curl -s \
  "${CONDUIT_URL}/_matrix/client/v3/directory/room/%23admins%3A${SERVER_NAME}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" | jq -r '.room_id // empty')

if [ -z "$ADMIN_ROOM" ]; then
  echo "Error: Could not find admin room (#admins:${SERVER_NAME}). Is the token valid?"
  exit 1
fi

echo "Admin room: $ADMIN_ROOM"

# Read registration YAML
REG_CONTENT=$(cat "$REG_FILE")

# Send the register-appservice command to the admin room as a plain text message.
# Conduit's admin bot listens for messages of the form:
#   register-appservice
#   ```yaml
#   <registration yaml>
#   ```
TXN_ID="reg-$(date +%s)"
RESPONSE=$(curl -s -X PUT \
  "${CONDUIT_URL}/_matrix/client/v3/rooms/${ADMIN_ROOM}/send/m.room.message/${TXN_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg body "register-appservice
\`\`\`yaml
${REG_CONTENT}
\`\`\`" '{msgtype: "m.text", body: $body}')")

EVENT_ID=$(echo "$RESPONSE" | jq -r '.event_id // empty')
if [ -z "$EVENT_ID" ]; then
  echo "Error: Failed to send message. Response: $RESPONSE"
  exit 1
fi

echo "Registration command sent (event: $EVENT_ID)."
echo "Check the admin room for a confirmation message from the server bot."
