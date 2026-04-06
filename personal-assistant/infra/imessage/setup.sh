#!/usr/bin/env bash
# infra/imessage/setup.sh
# Run on a fresh LightNode Mac VPS (macOS Sequoia) via SSH.
# Usage: bash setup.sh <bb_password> <bb_port>
set -euo pipefail

BB_PASSWORD="${1:?Usage: setup.sh <bb_password> <bb_port>}"
BB_PORT="${2:-1234}"

echo "=== BitBit iMessage Bridge Setup ==="

# 1. Install BlueBubbles from DMG
if [ ! -d "/Applications/BlueBubbles.app" ]; then
  echo "Installing BlueBubbles..."
  BB_DMG_URL="https://github.com/BlueBubblesApp/bluebubbles-server/releases/latest/download/BlueBubbles.dmg"
  curl -L -o /tmp/BlueBubbles.dmg "$BB_DMG_URL"
  hdiutil attach /tmp/BlueBubbles.dmg -nobrowse -quiet
  cp -R "/Volumes/BlueBubbles/BlueBubbles.app" /Applications/
  hdiutil detach "/Volumes/BlueBubbles" -quiet
  rm /tmp/BlueBubbles.dmg
  echo "BlueBubbles installed."
else
  echo "BlueBubbles already installed."
fi

# 2. Allow through Gatekeeper
xattr -dr com.apple.quarantine /Applications/BlueBubbles.app 2>/dev/null || true

# 3. Start BlueBubbles headless
echo "Starting BlueBubbles in headless mode..."
/Applications/BlueBubbles.app/Contents/MacOS/BlueBubbles \
  --headless \
  --password "$BB_PASSWORD" \
  --port "$BB_PORT" \
  --proxy-service cloudflare \
  &

# Wait for startup
echo "Waiting for BlueBubbles to initialize..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${BB_PORT}/api/v1/ping?password=${BB_PASSWORD}" > /dev/null 2>&1; then
    echo "BlueBubbles is running."
    break
  fi
  sleep 2
done

# 4. Prevent sleep
caffeinate -s &
disown

# 5. Auto-start on login
osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/BlueBubbles.app", hidden:true}' 2>/dev/null || true

# 6. Install kiosk scripts
mkdir -p /opt/bitbit
cp "$(dirname "$0")/kiosk-watcher.sh" /opt/bitbit/kiosk-watcher.sh
chmod +x /opt/bitbit/kiosk-watcher.sh

# 7. Create kiosk setup script (called during provisioning with Apple ID)
cat > /opt/bitbit/kiosk-setup.sh << 'KIOSK_EOF'
#!/usr/bin/env bash
set -euo pipefail
APPLE_ID="${1:?Usage: kiosk-setup.sh <apple_id_email>}"

# Hide Dock
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 999
killall Dock 2>/dev/null || true

# Hide desktop icons
defaults write com.apple.finder CreateDesktop -bool false
killall Finder 2>/dev/null || true

# Disable keyboard shortcuts
defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add 32 "<dict><key>enabled</key><false/></dict>"
defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add 34 "<dict><key>enabled</key><false/></dict>"
defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add 64 "<dict><key>enabled</key><false/></dict>"

# Open Messages
open -a Messages
sleep 3

# Install and start kiosk watcher LaunchAgent
launchctl unload ~/Library/LaunchAgents/com.bitbit.kiosk-watcher.plist 2>/dev/null || true
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.bitbit.kiosk-watcher.plist << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bitbit.kiosk-watcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/bitbit/kiosk-watcher.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>1</integer>
</dict>
</plist>
PLIST_EOF
launchctl load ~/Library/LaunchAgents/com.bitbit.kiosk-watcher.plist

# Enable VNC
sudo defaults write /var/db/launchd.db/com.apple.launchd/overrides.plist com.apple.screensharing -dict Disabled -bool false
sudo launchctl load -w /System/Library/LaunchDaemons/com.apple.screensharing.plist 2>/dev/null || true

echo "Kiosk mode active. VNC ready."
KIOSK_EOF
chmod +x /opt/bitbit/kiosk-setup.sh

echo "=== Setup complete ==="
