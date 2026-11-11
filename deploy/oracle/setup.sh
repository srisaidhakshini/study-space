#!/usr/bin/env bash
# One-time setup of Study Space on an Oracle Cloud Ubuntu VM (Arm or x86).
# Run on the VM as the default `ubuntu` user:
#
#   REPO_URL=https://github.com/you/study-space.git bash setup.sh
#
# Optional: DOMAIN=play.example.com (default: <ip>.sslip.io, which needs no
# domain of your own), BRANCH=main. Safe to run again; it never overwrites
# your TURN secret.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

REPO_URL="${REPO_URL:?Set REPO_URL to the git URL of this repository}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/study-space
ENV_FILE=/etc/study-space.env
RUN_USER="$(id -un)"

[ "$(id -u)" -ne 0 ] || { echo "Run as a normal user with sudo (e.g. ubuntu), not root."; exit 1; }

echo "==> Finding this machine's addresses"
PUBLIC_IP="${PUBLIC_IP:-$(curl -fsS https://api.ipify.org)}"
PRIVATE_IP="$(ip -4 route get 1.1.1.1 | sed -n 's/.* src \([0-9.]*\).*/\1/p')"
DOMAIN="${DOMAIN:-${PUBLIC_IP//./-}.sslip.io}"
echo "    public ${PUBLIC_IP}, private ${PRIVATE_IP}, site https://${DOMAIN}"

echo "==> Installing packages"
sudo apt-get update -y
sudo -E apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https \
  coturn iptables-persistent openssl

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo -E apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo -E apt-get install -y caddy
fi

echo "==> Opening the VM firewall (the cloud network rules are separate: see README)"
open_port() { # proto port-or-range
  sudo iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p "$1" --dport "$2" -j ACCEPT
}
open_port tcp 80
open_port tcp 443
open_port tcp 3478
open_port udp 3478
open_port udp 49152:49351
sudo netfilter-persistent save

echo "==> Fetching the code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  sudo mkdir -p "$APP_DIR"
  sudo chown "$RUN_USER":"$RUN_USER" "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
DEPLOY="$APP_DIR/deploy/oracle"

echo "==> Settings (${ENV_FILE})"
if [ ! -f "$ENV_FILE" ]; then
  TURN_SECRET="$(openssl rand -hex 24)"
  sudo tee "$ENV_FILE" >/dev/null <<ENV
PORT=2567
NODE_ENV=production
TURN_HOST=${DOMAIN}
TURN_SECRET=${TURN_SECRET}
ENV
  sudo chmod 640 "$ENV_FILE"
  sudo chown root:"$RUN_USER" "$ENV_FILE"
fi
TURN_SECRET="$(sudo grep '^TURN_SECRET=' "$ENV_FILE" | cut -d= -f2-)"
echo "$DOMAIN" | sudo tee /etc/study-space.domain >/dev/null

echo "==> Building"
bash "$DEPLOY/build.sh"

echo "==> Game server service"
sed "s|@USER@|$RUN_USER|g; s|@APP_DIR@|$APP_DIR|g" "$DEPLOY/study-space.service" | sudo tee /etc/systemd/system/study-space.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable study-space
sudo systemctl restart study-space

echo "==> Web server (Caddy: HTTPS, static site, proxy to the game server)"
sed "s|@DOMAIN@|$DOMAIN|g; s|@APP_DIR@|$APP_DIR|g" "$DEPLOY/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl enable caddy
sudo systemctl restart caddy

echo "==> TURN relay for voice (coturn)"
sed "s|@DOMAIN@|$DOMAIN|g; s|@PUBLIC_IP@|$PUBLIC_IP|g; s|@PRIVATE_IP@|$PRIVATE_IP|g; s|@TURN_SECRET@|$TURN_SECRET|g" "$DEPLOY/turnserver.conf" | sudo tee /etc/turnserver.conf >/dev/null
if grep -q '^#\?TURNSERVER_ENABLED' /etc/default/coturn 2>/dev/null; then
  sudo sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
else
  echo 'TURNSERVER_ENABLED=1' | sudo tee -a /etc/default/coturn >/dev/null
fi
sudo systemctl enable coturn
sudo systemctl restart coturn

echo
echo "Done. Give Caddy a minute to get its certificate, then open:"
echo "    https://${DOMAIN}"
echo "Check:  curl -s https://${DOMAIN}/health   and   curl -s https://${DOMAIN}/api/ice"
