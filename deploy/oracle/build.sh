#!/usr/bin/env bash
# Installs dependencies and builds the client for this machine's address.
# The site and the game server share one address, so the client talks to its own origin.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DOMAIN="$(cat /etc/study-space.domain)"
cd "$APP_DIR"
npm ci
VITE_SERVER_URL="https://${DOMAIN}" npm run build
