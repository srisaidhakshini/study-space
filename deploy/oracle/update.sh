#!/usr/bin/env bash
# Deploys the latest code: run on the VM after pushing to the branch.
set -euo pipefail
APP_DIR=/opt/study-space
BRANCH="${BRANCH:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}"
git -C "$APP_DIR" fetch origin "$BRANCH"
git -C "$APP_DIR" reset --hard "origin/$BRANCH"
bash "$APP_DIR/deploy/oracle/build.sh"
# Restarting ends everyone's session (the world lives in memory), so do it when nobody is studying.
sudo systemctl restart study-space
echo "Updated and restarted."
