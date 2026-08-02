#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

command -v docker >/dev/null 2>&1 || { echo "docker is required"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose is required"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required"; exit 1; }

if [ ! -f .env ]; then
  sh deploy/scripts/setup-env.sh
else
  echo ".env exists; preserving it."
fi

if [ ! -f docker-compose.yml ]; then
  cp docker-compose.example.yml docker-compose.yml
else
  echo "docker-compose.yml exists; preserving it."
fi

docker compose build --no-cache
docker compose up -d postgres
docker compose run --rm migration
docker compose up -d web worker
sh deploy/scripts/check-deploy.sh

echo "Installation complete. Open NEXT_PUBLIC_APP_URL and finish password/TOTP bootstrap."
