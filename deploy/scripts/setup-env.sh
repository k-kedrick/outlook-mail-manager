#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

[ ! -f .env ] || { echo ".env already exists; refusing to overwrite."; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required"; exit 1; }

APP_URL="${APP_URL:-http://localhost:3005}"
DB_PASSWORD="$(openssl rand -hex 24)"

mkdir -p secrets backups
chmod 700 secrets backups
openssl rand -hex 32 > secrets/session_signing_key
{ printf 'v1:'; openssl rand -hex 32; } > secrets/data_encryption_keys
openssl rand -hex 32 > secrets/card_key_hmac_key
openssl rand -hex 24 > secrets/admin_bootstrap_password
openssl rand -hex 32 > secrets/metrics_bearer_token
chmod 600 secrets/*

cat > .env <<EOF
POSTGRES_DB=outlook_manager
POSTGRES_USER=outlook
POSTGRES_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://outlook:${DB_PASSWORD}@postgres:5432/outlook_manager?schema=public
NEXT_PUBLIC_APP_URL=${APP_URL}
MICROSOFT_CLIENT_ID=
MICROSOFT_CERTIFICATE_PATH=/run/secrets/microsoft_certificate
MICROSOFT_PRIVATE_KEY_PATH=/run/secrets/microsoft_private_key
MICROSOFT_CERTIFICATE_THUMBPRINT=
WORKER_POLL_INTERVAL_MS=2000
WORKER_CONCURRENCY=10
OAUTH_CONCURRENCY=2
GRAPH_CONCURRENCY=10
IMAP_CONCURRENCY=5
LOG_LEVEL=info
OTEL_EXPORTER_OTLP_ENDPOINT=
EOF
chmod 600 .env

echo "Created .env and Docker Secret files. Values were not printed."
