#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

APP_NAME="${APP_NAME:-outlook-mail-manager}"
APP_PORT="${APP_PORT:-3005}"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

echo "== Docker Compose status =="
compose ps

echo
echo "== Recent app logs =="
docker logs "$APP_NAME" --tail=80 || true

echo
echo "== Local HTTP checks =="
if ! command -v curl >/dev/null 2>&1; then
  echo "curl is not installed on host; install curl or check URLs manually."
  exit 1
fi

wait_for_url() {
  name="$1"
  url="$2"
  attempts="${3:-30}"
  delay="${4:-2}"

  count=1
  while [ "$count" -le "$attempts" ]; do
    if curl -fsSI "$url" >/dev/null 2>&1; then
      echo "$name: ok"
      return 0
    fi

    if [ "$count" -eq 1 ]; then
      echo "$name: waiting for app to become ready..."
    fi

    count=$((count + 1))
    sleep "$delay"
  done

  echo "$name: failed after $attempts attempts"
  return 1
}

wait_for_url "login" "http://127.0.0.1:${APP_PORT}/login"
wait_for_url "redeem" "http://127.0.0.1:${APP_PORT}/redeem"

public_app_url=""
if [ -f .env ]; then
  public_app_url="$(sed -n 's/^NEXT_PUBLIC_APP_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' .env | tail -n 1)"
fi

if [ -n "$public_app_url" ] && [ "$public_app_url" != "http://localhost:${APP_PORT}" ]; then
  echo "public app URL: $public_app_url"
fi

echo
echo "== .env safety checks =="
if [ ! -f .env ]; then
  echo ".env: missing"
  exit 1
fi

if grep -q 'APP_SECRET="replace-with-a-long-random-secret"' .env; then
  echo "APP_SECRET: still default, change it before production use"
else
  echo "APP_SECRET: set (value hidden)"
fi

if grep -q 'ADMIN_PASSWORD="change-me"' .env; then
  echo "ADMIN_PASSWORD: still default, change it before production use"
else
  echo "ADMIN_PASSWORD: set (value hidden)"
fi
