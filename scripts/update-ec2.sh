#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# SceptView Network Monitor — EC2 Update Script
# Run this to deploy a new version to an existing installation.
#
# Usage (from the project source directory):
#   chmod +x scripts/update-ec2.sh
#   sudo ./scripts/update-ec2.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_DIR="/opt/networkmonitor"
SERVICE_USER="networkmonitor"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && error "Run as root: sudo ./scripts/update-ec2.sh"
[[ ! -f "$APP_DIR/.env" ]] && error "No existing installation found at $APP_DIR. Run install-ec2.sh first."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"
[[ ! -f "$SOURCE_DIR/package.json" ]] && error "Cannot find package.json in $SOURCE_DIR"

# ── 1. Build ──────────────────────────────────────────────────────────────────
info "Installing dependencies..."
cd "$SOURCE_DIR"
npm ci --omit=dev 2>/dev/null || npm install

info "Building application..."
npm run build

# ── 2. Stop service ───────────────────────────────────────────────────────────
info "Stopping service..."
systemctl stop networkmonitor

# ── 3. Deploy new build ───────────────────────────────────────────────────────
info "Deploying new build to $APP_DIR..."
rm -rf "$APP_DIR/dist"
cp -r "$SOURCE_DIR/dist" "$APP_DIR/"
cp "$SOURCE_DIR/package.json" "$APP_DIR/"
cp "$SOURCE_DIR/package-lock.json" "$APP_DIR/" 2>/dev/null || true

# Only update node_modules if dependencies changed
if ! diff -q "$SOURCE_DIR/package-lock.json" "$APP_DIR/package-lock.json.bak" &>/dev/null; then
  info "Dependencies changed — updating node_modules..."
  rm -rf "$APP_DIR/node_modules"
  cp -r "$SOURCE_DIR/node_modules" "$APP_DIR/"
  cp "$APP_DIR/package-lock.json" "$APP_DIR/package-lock.json.bak" 2>/dev/null || true
fi

chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/dist"

# ── 4. Apply schema changes ───────────────────────────────────────────────────
info "Applying database schema changes..."
export $(grep -v '^#' "$APP_DIR/.env" | xargs)
cd "$SOURCE_DIR"
npx drizzle-kit push --force || warn "Schema push had warnings — check manually."

# ── 5. Restart service ────────────────────────────────────────────────────────
info "Starting service..."
systemctl start networkmonitor
sleep 2
systemctl is-active --quiet networkmonitor && info "Service restarted successfully." || \
  warn "Service may not have started — run: journalctl -u networkmonitor -n 50"

echo ""
echo -e "${GREEN}Update complete!${NC}"
echo -e "  Logs: journalctl -u networkmonitor -f"
echo ""
