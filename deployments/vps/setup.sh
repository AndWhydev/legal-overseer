#!/usr/bin/env bash
set -euo pipefail

# ─── BitBit VPS Setup Script ──────────────────────────────────────────────
# Target: Hetzner CX22 (Ubuntu 24.04 LTS)
# Usage: ssh root@your-server 'bash -s' < setup.sh

echo "==> BitBit VPS Setup — Hetzner CX22"

# ─── 1. System updates ────────────────────────────────────────────────────
apt-get update && apt-get upgrade -y
apt-get install -y curl git ufw fail2ban unattended-upgrades

# ─── 2. SSH hardening ─────────────────────────────────────────────────────
sed -i 's/#PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#MaxAuthTries 6/MaxAuthTries 3/' /etc/ssh/sshd_config
systemctl restart sshd

# ─── 3. Firewall ──────────────────────────────────────────────────────────
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 443/tcp   # HTTPS (for webhook callbacks)
ufw --force enable

# ─── 4. Create deploy user ────────────────────────────────────────────────
if ! id "deploy" &>/dev/null; then
  adduser --disabled-password --gecos "" deploy
  usermod -aG sudo deploy
  mkdir -p /home/deploy/.ssh
  cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
  chown -R deploy:deploy /home/deploy/.ssh
  chmod 700 /home/deploy/.ssh
  chmod 600 /home/deploy/.ssh/authorized_keys
fi

# ─── 5. Docker install ────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker deploy
fi

# ─── 6. Docker Compose install ────────────────────────────────────────────
if ! command -v docker-compose &>/dev/null; then
  COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep tag_name | cut -d '"' -f4)
  curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

# ─── 7. Application directory ─────────────────────────────────────────────
mkdir -p /opt/bitbit
chown deploy:deploy /opt/bitbit

# ─── 8. Cron for log rotation ─────────────────────────────────────────────
cat > /etc/logrotate.d/bitbit << 'LOGROTATE'
/opt/bitbit/logs/*.log {
  daily
  missingok
  rotate 7
  compress
  delaycompress
  notifempty
}
LOGROTATE

# ─── 9. Systemd service for docker-compose ────────────────────────────────
cat > /etc/systemd/system/bitbit-workers.service << 'SERVICE'
[Unit]
Description=BitBit Agent Workers
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=deploy
WorkingDirectory=/opt/bitbit
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable bitbit-workers

echo "==> Setup complete. Deploy code to /opt/bitbit and run: docker-compose up -d"
