#!/bin/bash
set -e

echo "BitBit Bridge Container"
echo "Protocol: ${BRIDGE_PROTOCOL}"
echo "Homeserver: ${MATRIX_HOMESERVER_URL}"

CONFIG_DIR="/data/config"
mkdir -p "$CONFIG_DIR"

# Determine bridge binary and default port
case "$BRIDGE_PROTOCOL" in
  whatsapp)
    BRIDGE_BIN="mautrix-whatsapp"
    BRIDGE_PORT=29318
    BRIDGE_ID="whatsapp"
    BOT_USERNAME="whatsappbot"
    USERNAME_TEMPLATE="whatsapp_{{.}}"
    COMMAND_PREFIX="!wa"
    ;;
  android-messages)
    BRIDGE_BIN="mautrix-gmessages"
    BRIDGE_PORT=29336
    BRIDGE_ID="gmessages"
    BOT_USERNAME="gmessagesbot"
    USERNAME_TEMPLATE="gmessages_{{.}}"
    COMMAND_PREFIX="!gm"
    ;;
  *)
    echo "Error: Unknown BRIDGE_PROTOCOL: ${BRIDGE_PROTOCOL}"
    echo "Must be one of: whatsapp, android-messages"
    exit 1
    ;;
esac

CONFIG_FILE="$CONFIG_DIR/config.yaml"
REG_FILE="$CONFIG_DIR/registration.yaml"

# Generate config on first boot
if [ ! -f "$CONFIG_FILE" ]; then
  echo "First boot — generating config..."

  # Extract domain from homeserver URL (e.g., https://bitbit-conduit.fly.dev -> bitbit-conduit.fly.dev)
  HS_DOMAIN=$(echo "$MATRIX_HOMESERVER_URL" | sed 's|https\?://||' | sed 's|/.*||')

  cat > "$CONFIG_FILE" <<YAML
homeserver:
  address: ${MATRIX_HOMESERVER_URL}
  domain: ${HS_DOMAIN}
  software: standard

appservice:
  address: http://localhost:${BRIDGE_PORT}
  hostname: 0.0.0.0
  port: ${BRIDGE_PORT}
  id: ${BRIDGE_ID}-${CONNECTION_ID:-default}
  bot:
    username: ${BOT_USERNAME}_${CONNECTION_ID:0:8}
    displayname: BitBit ${BRIDGE_PROTOCOL} bridge
    avatar: ""
  ephemeral_events: true
  as_token: ""
  hs_token: ""
  username_template: "${USERNAME_TEMPLATE}"

bridge:
  command_prefix: "${COMMAND_PREFIX}"
  personal_filtering_spaces: true
  permissions:
    "*": relay
    "${HS_DOMAIN}": user

database:
  type: sqlite3-fk-wal
  uri: file:$CONFIG_DIR/bridge.db?_txlock=immediate

logging:
  min_level: info
  writers:
    - type: stdout
      format: pretty-colored

YAML

  # Add provisioning API config for QR relay
  cat >> "$CONFIG_FILE" <<YAML
provisioning:
  prefix: /_matrix/provision
  shared_secret: ${PROVISIONING_SECRET:-generate}

YAML

  echo "Config generated at $CONFIG_FILE"
fi

# Generate registration if missing
if [ ! -f "$REG_FILE" ]; then
  echo "Generating registration..."
  $BRIDGE_BIN -c "$CONFIG_FILE" -g -r "$REG_FILE"
  echo "Registration generated at $REG_FILE"
fi

# POST registration to BitBit for Conduit setup
if [ -n "$WEBHOOK_URL" ] && [ -f "$REG_FILE" ]; then
  echo "Posting registration to BitBit..."
  REG_CONTENT=$(cat "$REG_FILE")

  # Extract the base URL from webhook URL (remove /api/connections/xxx/webhook)
  BASE_URL=$(echo "$WEBHOOK_URL" | sed 's|/api/connections/.*||')

  curl -s -X POST "${BASE_URL}/api/bridges/register-appservice" \
    -H "Content-Type: application/json" \
    -d "{\"connection_id\": \"${CONNECTION_ID}\", \"registration_yaml\": $(echo "$REG_CONTENT" | jq -Rs .)}" \
    || echo "Warning: Could not post registration to BitBit"
fi

# Start QR watcher in background — polls bridge provisioning API and relays QR to BitBit
if [ -n "$WEBHOOK_URL" ] && [ -n "$PROVISIONING_SECRET" ]; then
  BASE_URL=$(echo "$WEBHOOK_URL" | sed 's|/api/connections/.*||')
  QR_CALLBACK_URL="${BASE_URL}/api/bridges/qr-callback"

  (
    echo "QR watcher: waiting for bridge to start on port ${BRIDGE_PORT}..."
    sleep 5  # Give bridge time to boot

    for i in $(seq 1 60); do
      # Check if bridge provisioning API is up
      QR_RESPONSE=$(curl -s \
        -X POST "http://localhost:${BRIDGE_PORT}/_matrix/provision/v3/login/start" \
        -H "Authorization: Bearer ${PROVISIONING_SECRET}" \
        -H "Content-Type: application/json" \
        -d "{\"user_id\": \"\"}" \
        2>/dev/null || echo "")

      if [ -n "$QR_RESPONSE" ] && echo "$QR_RESPONSE" | jq -e '.code // .qr' > /dev/null 2>&1; then
        QR_DATA=$(echo "$QR_RESPONSE" | jq -r '.qr // .code // empty')
        if [ -n "$QR_DATA" ]; then
          echo "QR watcher: got QR code, relaying to BitBit..."
          curl -s -X POST "$QR_CALLBACK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"connection_id\": \"${CONNECTION_ID}\", \"secret\": \"${PROVISIONING_SECRET}\", \"qr\": $(echo "$QR_DATA" | jq -Rs .)}" \
            || echo "QR watcher: failed to relay QR"
          echo "QR watcher: done"
          break
        fi
      fi

      sleep 3
    done
    echo "QR watcher: exiting"
  ) &
fi

echo "Starting $BRIDGE_BIN..."
exec $BRIDGE_BIN -c "$CONFIG_FILE"
