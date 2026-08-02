#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."
docker compose ps

attempt=0
until curl -fsS http://127.0.0.1:3005/api/health/ready >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    docker compose logs --tail=150 web worker postgres
    echo "readiness did not become healthy"
    exit 1
  fi
  sleep 2
done

curl -fsS http://127.0.0.1:3005/api/health/live
echo
curl -fsS http://127.0.0.1:3005/api/health/ready
echo
