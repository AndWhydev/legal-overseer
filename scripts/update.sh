#!/usr/bin/env bash
# Legal Overseer — in-place updater.
#
# Pulls the latest tag from the git remote (or rebuilds the Docker
# image), runs migrations, and restarts. The DATABASE_PATH and the
# MATTER_FOLDERS_ROOT live OUTSIDE the source tree, so this script
# never touches firm data.
#
# Run from the install directory:
#   npm run update            (npm script that calls this file)
#   ./scripts/update.sh
#
# Flags:
#   --no-pull      Skip git pull (use already-checked-out code).
#   --docker       Use docker compose instead of npm.
#   --branch X     Pull a specific branch/tag (default: main).

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

PULL=1
USE_DOCKER=0
BRANCH="main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull) PULL=0; shift ;;
    --docker)  USE_DOCKER=1; shift ;;
    --branch)  BRANCH="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

echo "==> Legal Overseer updater"
echo "    Repo root: $ROOT"
echo "    Branch:    $BRANCH"
echo "    Mode:      $([[ $USE_DOCKER -eq 1 ]] && echo docker || echo npm)"

# Sanity check that the data dir is OUTSIDE the source tree — refuse
# to proceed if the firm has accidentally co-located data inside the
# repo (a destructive update could overwrite it).
if [[ -d "$ROOT/data" ]] && [[ "$(readlink -f "$ROOT/data")" == "$ROOT"* ]]; then
  if [[ -z "${ALLOW_INTREE_DATA:-}" ]]; then
    echo "Refusing to update: ./data lives inside the repo." >&2
    echo "Move the firm's data to a path outside the source tree, or" >&2
    echo "set ALLOW_INTREE_DATA=1 to override (not recommended)." >&2
    exit 2
  fi
fi

# Always back up the SQLite file (if present) before any change.
if [[ -f "$ROOT/data/legal-overseer.db" ]] || [[ -f "${DATABASE_PATH:-}" ]]; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  BACKUP_DIR="${ROOT}/data/backups"
  mkdir -p "$BACKUP_DIR"
  DB_PATH="${DATABASE_PATH:-$ROOT/data/legal-overseer.db}"
  if [[ -f "$DB_PATH" ]]; then
    cp "$DB_PATH" "$BACKUP_DIR/legal-overseer.${STAMP}.db"
    echo "==> Backed up database to $BACKUP_DIR/legal-overseer.${STAMP}.db"
  fi
fi

if [[ $PULL -eq 1 ]]; then
  echo "==> git fetch + checkout $BRANCH"
  git fetch --tags origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

if [[ $USE_DOCKER -eq 1 ]]; then
  echo "==> docker compose build"
  docker compose build --pull
  echo "==> docker compose up -d"
  docker compose up -d
else
  echo "==> npm install"
  npm ci --omit=dev
  echo "==> migrations run on next start"
  if command -v systemctl >/dev/null && systemctl is-active --quiet legal-overseer; then
    echo "==> systemctl restart legal-overseer"
    sudo systemctl restart legal-overseer
  else
    echo "==> manual restart required. Stop and restart your existing process:"
    echo "    npm run start"
  fi
fi

echo "==> Update complete."
