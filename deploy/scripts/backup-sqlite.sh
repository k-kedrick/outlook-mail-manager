#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

DB_PATH="${DB_PATH:-data/dev.db}"
BACKUP_DIR="${BACKUP_DIR:-data/backups}"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F-%H%M%S)"
TARGET="$BACKUP_DIR/dev.db.bak.$STAMP"

cp "$DB_PATH" "$TARGET"
echo "Backup created: $TARGET"
