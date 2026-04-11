#!/bin/bash
# restore.sh - Restore SQLite from backup
# Usage: ./restore.sh /data/backups/bitbit_YYYYMMDD_HHMMSS.db.gz
#
# Environment: DATABASE_PATH (default: /data/bitbit.db)

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.db.gz>"
    echo ""
    echo "Available backups:"
    ls -la /data/backups/*.db.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$1"
DB_PATH="${DATABASE_PATH:-/data/bitbit.db}"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

echo "WARNING: This will replace the current database!"
echo "Current DB: ${DB_PATH}"
echo "Backup: ${BACKUP_FILE}"
read -p "Continue? (y/N) " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Aborted."
    exit 0
fi

# Create backup of current database before restore
if [ -f "${DB_PATH}" ]; then
    CURRENT_BACKUP="/data/backups/pre_restore_$(date +%Y%m%d_%H%M%S).db"
    echo "Backing up current database to: ${CURRENT_BACKUP}"
    sqlite3 "${DB_PATH}" ".backup '${CURRENT_BACKUP}'"
fi

# Decompress to temp file
TEMP_DB=$(mktemp)
gunzip -c "${BACKUP_FILE}" > "${TEMP_DB}"

# Replace current database
mv "${TEMP_DB}" "${DB_PATH}"

echo "[$(date -Iseconds)] Database restored from: ${BACKUP_FILE}"
