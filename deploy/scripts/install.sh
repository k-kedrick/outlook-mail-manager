#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../.."

APP_NAME="${APP_NAME:-outlook-mail-manager}"
APP_PORT="${APP_PORT:-3005}"
APP_DOMAIN="${APP_DOMAIN:-}"
ACCESS_MODE="${ACCESS_MODE:-}"
INSTALL_NGINX="${INSTALL_NGINX:-0}"
ENV_FILE="${ENV_FILE:-.env}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

first_host_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

prompt() {
  label="$1"
  default_value="$2"
  printf "%s [%s]: " "$label" "$default_value" >&2
  read -r input
  if [ -n "$input" ]; then
    printf "%s" "$input"
  else
    printf "%s" "$default_value"
  fi
}

prompt_password() {
  printf "ADMIN_PASSWORD: " >&2
  stty -echo 2>/dev/null || true
  read -r password
  stty echo 2>/dev/null || true
  printf "\n" >&2
  if [ -z "$password" ]; then
    echo "ADMIN_PASSWORD cannot be empty."
    exit 1
  fi
  printf "%s" "$password"
}

if [ -z "$ACCESS_MODE" ] && [ "$INSTALL_NGINX" = "1" ]; then
  ACCESS_MODE="reverse-proxy"
fi

if [ -z "$ACCESS_MODE" ]; then
  echo "Choose access mode:"
  echo "  1) reverse-proxy  bind 127.0.0.1:${APP_PORT}, use Nginx/Caddy/HTTPS"
  echo "  2) direct-ip      bind 0.0.0.0:${APP_PORT}, access by server-ip:${APP_PORT}"
  echo "  3) local          bind 127.0.0.1:${APP_PORT}, local testing only"
  printf "Access mode [1]: "
  read -r mode_choice
  case "${mode_choice:-1}" in
    1) ACCESS_MODE="reverse-proxy" ;;
    2) ACCESS_MODE="direct-ip" ;;
    3) ACCESS_MODE="local" ;;
    reverse-proxy|direct-ip|local) ACCESS_MODE="$mode_choice" ;;
    *)
      echo "Invalid access mode."
      exit 1
      ;;
  esac
fi

case "$ACCESS_MODE" in
  reverse-proxy)
    PORT_BIND="127.0.0.1:${APP_PORT}:${APP_PORT}"
    if [ -n "$APP_DOMAIN" ]; then
      DEFAULT_APP_URL="https://${APP_DOMAIN}"
    else
      DEFAULT_APP_URL="https://mail.example.com"
    fi
    ;;
  direct-ip)
    PORT_BIND="0.0.0.0:${APP_PORT}:${APP_PORT}"
    DEFAULT_IP="$(first_host_ip)"
    DEFAULT_APP_URL="http://${DEFAULT_IP:-server-ip}:${APP_PORT}"
    ;;
  local)
    PORT_BIND="127.0.0.1:${APP_PORT}:${APP_PORT}"
    DEFAULT_APP_URL="http://localhost:${APP_PORT}"
    ;;
  *)
    echo "Invalid ACCESS_MODE: $ACCESS_MODE"
    exit 1
    ;;
esac

APP_URL="$(prompt "Public app URL" "$DEFAULT_APP_URL")"

if [ -f "$ENV_FILE" ] || [ -f "$COMPOSE_FILE" ] || [ -d data ]; then
  echo
  echo "This installer is empty-database first."
  echo "Overwriting/removing these files will delete server-side app data:"
  echo "  - $ENV_FILE"
  echo "  - $COMPOSE_FILE"
  echo "  - data/"
  printf "Type RESET to continue: "
  read -r reset_confirm
  if [ "$reset_confirm" != "RESET" ]; then
    echo "Canceled."
    exit 1
  fi
  rm -f "$ENV_FILE" "$COMPOSE_FILE"
  rm -rf data
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate APP_SECRET."
  exit 1
fi

APP_SECRET="$(openssl rand -hex 32)"
ADMIN_PASSWORD="$(prompt_password)"

mkdir -p data

cat > "$ENV_FILE" <<EOF
DATABASE_URL="file:/app/data/dev.db"
APP_SECRET="$APP_SECRET"
ADMIN_PASSWORD="$ADMIN_PASSWORD"
NEXT_PUBLIC_APP_URL="$APP_URL"
KEEP_ALIVE_ENABLED="1"
KEEP_ALIVE_INTERVAL_HOURS="168"
NEXT_PUBLIC_KEEP_ALIVE_INTERVAL_HOURS="168"
EOF

cat > "$COMPOSE_FILE" <<EOF
services:
  outlook-mail-manager:
    build: .
    container_name: ${APP_NAME}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      DATABASE_URL: "file:/app/data/dev.db"
    ports:
      - "${PORT_BIND}"
    volumes:
      - ./data:/app/data
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "node -e \\"fetch('http://127.0.0.1:${APP_PORT}/login').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\\"",
        ]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
EOF

echo
echo "$ENV_FILE and $COMPOSE_FILE created."
echo "APP_SECRET and ADMIN_PASSWORD are hidden from output."
echo "Access mode: $ACCESS_MODE"
echo "Port bind: $PORT_BIND"
echo "Public app URL: $APP_URL"

echo
echo "Starting Docker Compose..."
compose up -d --build

echo
APP_NAME="$APP_NAME" APP_PORT="$APP_PORT" sh deploy/scripts/check-deploy.sh

if [ "$INSTALL_NGINX" = "1" ]; then
  if [ -z "$APP_DOMAIN" ]; then
    echo "INSTALL_NGINX=1 requires APP_DOMAIN, for example APP_DOMAIN=outlook.example.com."
    exit 1
  fi
  if [ "$(id -u)" -ne 0 ]; then
    echo "INSTALL_NGINX=1 must run as root."
    exit 1
  fi

  NGINX_AVAILABLE="/etc/nginx/sites-available/$APP_DOMAIN"
  NGINX_ENABLED="/etc/nginx/sites-enabled/$APP_DOMAIN"
  sed "s/server_name mail.example.com;/server_name ${APP_DOMAIN};/" deploy/nginx/app.example.conf > "$NGINX_AVAILABLE"
  ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  nginx -t
  systemctl reload nginx
  echo "Nginx configured for $APP_DOMAIN."
  echo "To enable HTTPS, run: certbot --nginx -d $APP_DOMAIN"
else
  echo
  if [ "$ACCESS_MODE" = "reverse-proxy" ]; then
    echo "Next: configure Nginx/Caddy to proxy to http://127.0.0.1:${APP_PORT}."
    echo "Template: deploy/nginx/app.example.conf"
  elif [ "$ACCESS_MODE" = "direct-ip" ]; then
    echo "Open firewall/security-group port ${APP_PORT} if needed, then visit: $APP_URL"
  else
    echo "Visit locally: $APP_URL"
  fi
fi
