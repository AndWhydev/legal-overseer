#!/usr/bin/env bash
# infra/imessage/kiosk-watcher.sh
# LaunchAgent that keeps Messages.app focused and in the foreground.

while true; do
  FRONT_APP=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true' 2>/dev/null || echo "")
  if [ "$FRONT_APP" != "Messages" ]; then
    if ! pgrep -q "Messages"; then
      open -a Messages
      sleep 2
    fi
    osascript -e 'tell application "Messages" to activate' 2>/dev/null || true
  fi
  sleep 0.5
done
