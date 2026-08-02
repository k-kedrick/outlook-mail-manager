#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."
mkdir -p backups
chmod 700 backups
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="backups/outlook-${STAMP}.dump"

docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$TARGET"
chmod 600 "$TARGET"
test -s "$TARGET" || { echo "Backup is empty"; exit 1; }
echo "Created $TARGET"

# Daily local retention. Weekly/monthly copies should be handled by the
# external backup destination described in DEPLOY.md.
find backups -type f -name 'outlook-*.dump' -mtime +7 -delete
