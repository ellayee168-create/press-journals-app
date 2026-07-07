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

echo "==> [1/6] Ensuring swap exists (small VMs need it for the build + PDF rendering)"
if [ ! -f /swapfile ] && [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 3000 ]; then
  sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo "    4G swapfile created"
fi

echo "==> [2/6] Installing Docker + git (if missing)"
if ! command -v git >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git </dev/null
fi
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi

# NOTE on firewalls: web traffic reaches the containers through Docker's published
# ports (-p 80/443 below). Docker manages its own iptables NAT rules and re-creates
# them on every boot, so no fragile host-firewall edits are needed. The Oracle
# security list (ingress 80/443) is still required — that's done in the console.

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
sudo docker network create press-net 2>/dev/null || true
sudo docker rm -f press-journals 2>/dev/null || true

if [ -n "$APP_DOMAIN" ]; then BASE_URL="https://$APP_DOMAIN"; else BASE_URL="http://$(curl -fsS ifconfig.me)"; fi

# App is NOT published to the host — only Caddy can reach it via the docker network.
sudo docker run -d --name press-journals --restart unless-stopped \
  --network press-net \
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
  sudo docker run -d --name press-caddy --restart unless-stopped \
    --network press-net -p 80:80 -p 443:443 -p 443:443/udp \
    -v caddy-data:/data \
    caddy:2 caddy reverse-proxy --from "$APP_DOMAIN" --to press-journals:3000
  echo ""
  echo "✅ Done! The site will be live at: https://$APP_DOMAIN  (cert takes ~30s on first run)"
else
  sudo docker run -d --name press-caddy --restart unless-stopped \
    --network press-net -p 80:80 \
    caddy:2 caddy reverse-proxy --from ":80" --to press-journals:3000
  echo ""
  echo "✅ Done! The site is live at: $BASE_URL"
  echo "   (No APP_DOMAIN set — running plain HTTP. Set up a free DuckDNS domain for HTTPS.)"
fi
echo ""
echo "Admin dashboard: $BASE_URL/admin"
echo "To update later: re-run this same command."
