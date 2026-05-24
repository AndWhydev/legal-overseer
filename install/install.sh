#!/usr/bin/env bash
# Legal Overseer — Linux installation script.
#
# Run on a fresh Ubuntu / Debian / RHEL server with sudo:
#
#   curl -fsSL https://install.legaloverseer.com.au | sudo bash
#   # or, from a checked-out tree:
#   sudo ./install/install.sh
#
# What this script does:
#   1. Verifies the OS and a minimum Docker engine version.
#   2. Creates an `overseer` system user and `/opt/legal-overseer`.
#   3. Drops a copy of docker-compose.yml + .env.example into place.
#   4. Prompts you for the licence key (or accepts --licence-file FILE).
#   5. Brings the stack up with `docker compose up -d`.
#   6. Prints the dashboard URL so the IT person can finish in a browser.
#
# Re-running this script is safe — it never overwrites .env or licence.key.

set -euo pipefail

INSTALL_DIR="/opt/legal-overseer"
DATA_DIR="${INSTALL_DIR}/data"
COMPOSE_FILE_URL="${COMPOSE_FILE_URL:-}"   # if empty, copy from cwd
ENV_TEMPLATE_URL="${ENV_TEMPLATE_URL:-}"
LICENCE_FILE=""
NON_INTERACTIVE=0

usage() {
  cat <<'USAGE'
Legal Overseer installer

Usage:
  sudo ./install.sh [options]

Options:
  --licence-file FILE     Use the licence key at FILE (otherwise prompted).
  --install-dir PATH      Install at PATH (default /opt/legal-overseer).
  --non-interactive       Don't prompt — use defaults / env vars only.
  -h, --help              Show this help.

Environment variables you can pre-set:
  LICENCE_KEY             Licence key string (instead of a file).
  ADMIN_EMAIL             Operator email for briefings + alerts.
  SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS  SMTP relay settings.
  ANTHROPIC_API_KEY       Required if ENABLE_TASK_PROCESSOR=true.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --licence-file) LICENCE_FILE="$2"; shift 2 ;;
    --install-dir)  INSTALL_DIR="$2"; DATA_DIR="${INSTALL_DIR}/data"; shift 2 ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must be run as root (use sudo)." >&2
  exit 1
fi

echo "==> Checking prerequisites"
if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<'EOM'
Docker is required but was not found.

Install Docker first:
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker

Then re-run this installer.
EOM
  exit 2
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin not found. Install 'docker-compose-plugin' from your distro." >&2
  exit 2
fi

DOCKER_VERSION="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"
echo "    Docker engine: ${DOCKER_VERSION}"

if ! getent passwd overseer >/dev/null 2>&1; then
  echo "==> Creating system user 'overseer'"
  useradd --system --home-dir "${INSTALL_DIR}" --shell /usr/sbin/nologin overseer
fi

mkdir -p "${INSTALL_DIR}" "${DATA_DIR}/matters" "${DATA_DIR}/inbox-monitor" "${DATA_DIR}/backups"
chown -R overseer: "${INSTALL_DIR}"

echo "==> Copying compose files"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${REPO_ROOT}/docker-compose.yml" ]]; then
  cp "${REPO_ROOT}/docker-compose.yml" "${INSTALL_DIR}/docker-compose.yml"
  cp -R "${REPO_ROOT}" "${INSTALL_DIR}/src-tree"   # shipped source for `docker compose build`
elif [[ -n "${COMPOSE_FILE_URL}" ]]; then
  curl -fsSL "${COMPOSE_FILE_URL}" -o "${INSTALL_DIR}/docker-compose.yml"
else
  echo "Could not locate docker-compose.yml. Place this script next to the repo or set COMPOSE_FILE_URL." >&2
  exit 3
fi

if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
  if [[ -f "${REPO_ROOT}/.env.example" ]]; then
    cp "${REPO_ROOT}/.env.example" "${INSTALL_DIR}/.env"
  fi
  chmod 600 "${INSTALL_DIR}/.env"
  echo "    Created ${INSTALL_DIR}/.env from template — edit it before going live."
fi

# --- licence ---
if [[ -n "${LICENCE_FILE}" ]]; then
  install -m 600 -o overseer "${LICENCE_FILE}" "${DATA_DIR}/licence.key"
elif [[ -n "${LICENCE_KEY:-}" ]]; then
  umask 077
  printf '%s\n' "${LICENCE_KEY}" > "${DATA_DIR}/licence.key"
  chown overseer "${DATA_DIR}/licence.key"
elif [[ ${NON_INTERACTIVE} -eq 0 && ! -f "${DATA_DIR}/licence.key" ]]; then
  echo
  echo "Paste your Legal Overseer licence key, then press Enter and Ctrl-D:"
  if KEY="$(cat)"; then
    umask 077
    printf '%s\n' "${KEY}" > "${DATA_DIR}/licence.key"
    chown overseer "${DATA_DIR}/licence.key"
  fi
fi

if [[ ! -f "${DATA_DIR}/licence.key" ]]; then
  echo "    No licence key installed yet — the system will boot in 14-day trial mode."
fi

chown -R overseer: "${DATA_DIR}"
chmod 700 "${DATA_DIR}"

echo "==> Starting Legal Overseer"
cd "${INSTALL_DIR}"
docker compose up -d --build

# --- systemd unit so the firm's IT team can start/stop with normal tooling ---
UNIT="/etc/systemd/system/legal-overseer.service"
if [[ ! -f "${UNIT}" ]]; then
  cat > "${UNIT}" <<EOF
[Unit]
Description=Legal Overseer (docker compose)
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable legal-overseer.service
  echo "    systemd unit installed: legal-overseer.service"
fi

DASHBOARD_URL="http://$(hostname -I | awk '{print $1}'):3000/setup"
cat <<EOM

============================================================
Legal Overseer is starting.

Next steps:
  1. Open ${DASHBOARD_URL} in a browser on the firm's network.
  2. Walk through the first-run setup wizard.
  3. Edit ${INSTALL_DIR}/.env to add SMTP + inbox credentials.
  4. systemctl restart legal-overseer  (to pick up env changes)

To check status:
  docker compose -f ${INSTALL_DIR}/docker-compose.yml ps
  curl http://127.0.0.1:8080/health | jq .

Logs:
  docker compose -f ${INSTALL_DIR}/docker-compose.yml logs -f legal-overseer

Updating:
  cd ${INSTALL_DIR} && docker compose pull && docker compose up -d
  # or  bash ${INSTALL_DIR}/src-tree/scripts/update.sh --docker

Support: support@legaloverseer.com.au
============================================================
EOM
