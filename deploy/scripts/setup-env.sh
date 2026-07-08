#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

APP_URL="${APP_URL:-https://outlook.2963wang.shop}"
ENV_FILE="${ENV_FILE:-.env}"

if [ -f "$ENV_FILE" ]; then
  echo "$ENV_FILE already exists."
  printf "Overwrite it? Type YES to continue: "
  read -r confirm
  if [ "$confirm" != "YES" ]; then
    echo "Canceled."
    exit 1
  fi
fi

printf "APP_SECRET (leave empty to generate one): "
read -r app_secret
if [ -z "$app_secret" ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl is required to auto-generate APP_SECRET. Install openssl or enter APP_SECRET manually."
    exit 1
  fi
  app_secret="$(openssl rand -hex 32)"
  echo "APP_SECRET generated."
fi

printf "ADMIN_PASSWORD: "
stty -echo 2>/dev/null || true
read -r admin_password
stty echo 2>/dev/null || true
printf "\n"

if [ -z "$admin_password" ]; then
  echo "ADMIN_PASSWORD cannot be empty."
  exit 1
fi

cat > "$ENV_FILE" <<EOF
DATABASE_URL="file:/app/data/dev.db"
APP_SECRET="$app_secret"
ADMIN_PASSWORD="$admin_password"
NEXT_PUBLIC_APP_URL="$APP_URL"
KEEP_ALIVE_ENABLED="1"
KEEP_ALIVE_INTERVAL_HOURS="168"
NEXT_PUBLIC_KEEP_ALIVE_INTERVAL_HOURS="168"
EOF

mkdir -p data

echo "$ENV_FILE created for Docker deployment."
echo "APP_SECRET and ADMIN_PASSWORD are hidden from output."
