#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# SceptView Network Monitor — EC2 Update Script
# Run this from the project root after pulling new code.
#
# Usage:
#   git pull
#   chmod +x scripts/update-ec2.sh
#   sudo ./scripts/update-ec2.sh
#
# Builds in place, applies schema changes, and restarts the service.
# The directory structure is never changed.
# ─────────────────────────────────────────────────────────────────────────────
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && error "Run as root: sudo ./scripts/update-ec2.sh"

# ── Resolve project root ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
[[ ! -f "$APP_DIR/package.json" ]] && error "Cannot find package.json in $APP_DIR"
[[ ! -f "$APP_DIR/.env" ]] && error "No .env found in $APP_DIR. Run install-ec2.sh first."
info "Project root: $APP_DIR"

cd "$APP_DIR"

# ── 1. Install dependencies ────────────────────────────────────────────────────
info "Installing npm dependencies..."
# Use the public registry — package-lock.json may contain Replit's internal
# proxy URLs (package-firewall.replit.local) which are unreachable outside Replit.
npm install --registry https://registry.npmjs.org

# ── 2. Build in place ─────────────────────────────────────────────────────────
info "Building application..."
npm run build

# ── 3. Apply schema changes ───────────────────────────────────────────────────
info "Applying database schema changes..."
export $(grep -v '^#' .env | xargs)

# Apply known safe SQL constraints directly before drizzle-kit runs.
# This prevents drizzle-kit from prompting to truncate tables with existing data.
sudo -u postgres psql -d networkmonitor -c "
  ALTER TABLE sites ADD CONSTRAINT sites_name_unique UNIQUE (name);
" 2>/dev/null || true  # silently skip if constraint already exists

npx drizzle-kit push --force || warn "Schema push had warnings — check manually."

# ── 4. Restart service ────────────────────────────────────────────────────────
info "Restarting service..."
systemctl restart networkmonitor
sleep 2
systemctl is-active --quiet networkmonitor && info "Service restarted successfully." || \
  warn "Service may not have started — run: journalctl -u networkmonitor -n 50"

echo ""
echo -e "${GREEN}Update complete!${NC}"
echo -e "  Logs: journalctl -u networkmonitor -f"
echo ""
