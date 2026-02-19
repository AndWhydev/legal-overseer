#!/bin/bash
# backup.sh - SQLite online backup for BitBit
# Run daily via cron or manually
#
# Usage: ./backup.sh
# Environment: DATABASE_PATH (default: /data/bitbit.db)

set -e

DATE=$(date +%Y%m%d_%H%M%S)
DB_PATH="${DATABASE_PATH:-/data/bitbit.db}"
BACKUP_DIR="/data/backups"
BACKUP_PATH="${BACKUP_DIR}/bitbit_${DATE}.db"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Verify source database exists
if [ ! -f "${DB_PATH}" ]; then
    echo "[$(date -Iseconds)] ERROR: Database not found: ${DB_PATH}"
    exit 1
fi

# SQLite online backup (safe while db is in use)
sqlite3 "${DB_PATH}" ".backup '${BACKUP_PATH}'"

# Compress backup
gzip "${BACKUP_PATH}"

# Keep only last 30 days of backups
find "${BACKUP_DIR}" -name "*.db.gz" -mtime +30 -delete

echo "[$(date -Iseconds)] Backup completed: ${BACKUP_PATH}.gz"
