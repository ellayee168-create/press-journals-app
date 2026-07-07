#!/usr/bin/env bash
# One-shot server setup for the PRESS Journals app on a fresh Ubuntu VM
# (tested target: Oracle Cloud Always Free ARM instance, Ubuntu 22.04/24.04).
#
# Usage (on the VM):
#   export ADMIN_PASSWORD='choose-a-strong-password'
#   export APP_DOMAIN='pressjournals.duckdns.org'   # optional — enables HTTPS via Caddy
#   curl -fsSL https://raw.githubusercontent.com/ellayee168-create/press-journals-app/main/deploy/setup-server.sh | bash
#
# Re-running is safe: it rebuilds the image and restarts the container,
# leaving all data (uploads + database) intact on the docker volume.
set -euo pipefail

REPO_URL="https://github.com/ellayee168-create/press-journals-app.git"
APP_DIR=/opt/press-journals
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD before running (export ADMIN_PASSWORD='...')}"
APP_DOMAIN="${APP_DOMAIN:-}"

echo "==> [1/6] Installing Docker (if missing)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi

echo "==> [2/6] Opening firewall ports 80/443 (Oracle images ship with restrictive iptables)"
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
# Persist across reboots if the tool is available
sudo netfilter-persistent save 2>/dev/null || sudo sh -c 'apt-get install -y iptables-persistent >/dev/null 2>&1 && netfilter-persistent save' || true

echo "==> [3/6] Fetching the app"
if [ -d "$APP_DIR/.git" ]; then
  sudo git -C "$APP_DIR" pull --ff-only
else
  sudo git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> [4/6] Building the Docker image (first build takes ~5 min)"
sudo docker build -t press-journals "$APP_DIR"

echo "==> [5/6] Starting the app container"
sudo docker volume create press-data >/dev/null
sudo docker rm -f press-journals 2>/dev/null || true

if [ -n "$APP_DOMAIN" ]; then BASE_URL="https://$APP_DOMAIN"; else BASE_URL="http://$(curl -fsS ifconfig.me)"; fi

sudo docker run -d --name press-journals --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v press-data:/app/uploads \
  -e DB_PATH=/app/uploads/press-journals.db \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e NEXT_PUBLIC_BASE_URL="$BASE_URL" \
  ${SMTP_HOST:+-e SMTP_HOST="$SMTP_HOST"} \
  ${SMTP_PORT:+-e SMTP_PORT="$SMTP_PORT"} \
  ${SMTP_USER:+-e SMTP_USER="$SMTP_USER"} \
  ${SMTP_PASS:+-e SMTP_PASS="$SMTP_PASS"} \
  ${SMTP_FROM:+-e SMTP_FROM="$SMTP_FROM"} \
  press-journals

echo "==> [6/6] Setting up Caddy reverse proxy (HTTPS if APP_DOMAIN is set)"
sudo docker rm -f press-caddy 2>/dev/null || true
if [ -n "$APP_DOMAIN" ]; then
  # Caddy fetches a Let's Encrypt certificate for the domain automatically.
  sudo docker run -d --name press-caddy --restart unless-stopped --network host \
    -v caddy-data:/data \
    caddy:2 caddy reverse-proxy --from "$APP_DOMAIN" --to 127.0.0.1:3000
  echo ""
  echo "✅ Done! The site will be live at: https://$APP_DOMAIN  (cert takes ~30s on first run)"
else
  sudo docker run -d --name press-caddy --restart unless-stopped --network host \
    caddy:2 caddy reverse-proxy --from ":80" --to 127.0.0.1:3000
  echo ""
  echo "✅ Done! The site is live at: $BASE_URL"
  echo "   (No APP_DOMAIN set — running plain HTTP. Set up a free DuckDNS domain for HTTPS.)"
fi
echo ""
echo "Admin dashboard: $BASE_URL/admin"
echo "To update later: re-run this same command."
