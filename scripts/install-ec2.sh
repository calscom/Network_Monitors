#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# SceptView Network Monitor — EC2 Installation Script
# Tested on: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS
#
# Usage (run from the project root):
#   chmod +x scripts/install-ec2.sh
#   sudo ./scripts/install-ec2.sh
#
# The app runs directly from the project directory — no files are moved or
# restructured. The directory you run this from becomes the installation root.
#
# What this does:
#   1. Installs Node.js 22, PostgreSQL, Nginx
#   2. Creates the database and user
#   3. Installs npm dependencies and builds the app in place
#   4. Writes .env in the project root
#   5. Creates a systemd service (networkmonitor)
#   6. Configures Nginx as a reverse proxy on port 80
#   7. Runs the database schema push
# ─────────────────────────────────────────────────────────────────────────────
set -e

SERVICE_USER="networkmonitor"
DB_NAME="networkmonitor"
DB_USER="networkmonitor"
APP_PORT="5000"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── 0. Root check ─────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Run as root: sudo ./scripts/install-ec2.sh"

# ── 1. Resolve project root (same directory the script lives in) ───────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
[[ ! -f "$APP_DIR/package.json" ]] && error "Cannot find package.json in $APP_DIR"
info "Project root (installation directory): $APP_DIR"

# ── 2. System packages ────────────────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get install -y curl gnupg2 ca-certificates lsb-release nginx postgresql postgresql-contrib openssl net-tools

# ── 3. Node.js 22 via NodeSource ──────────────────────────────────────────────
if ! node --version 2>/dev/null | grep -q "v22"; then
  info "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
info "Node version: $(node --version)"

# ── 4. PostgreSQL setup ───────────────────────────────────────────────────────
info "Setting up PostgreSQL..."
systemctl enable --now postgresql

DB_PASSWORD=$(openssl rand -hex 24)

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
# Required for Drizzle to create tables in the public schema (PG 15+)
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;" 2>/dev/null || true

DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
info "Database ready."

# ── 5. Create system user ─────────────────────────────────────────────────────
id "$SERVICE_USER" &>/dev/null || useradd --system --no-create-home --shell /bin/false "$SERVICE_USER"

# ── 6. Install dependencies and build in place ────────────────────────────────
cd "$APP_DIR"

info "Installing npm dependencies..."
# Use the public registry — package-lock.json may contain Replit's internal
# proxy URLs (package-firewall.replit.local) which are unreachable outside Replit.
npm install --registry https://registry.npmjs.org

info "Building application..."
npm run build

# ── 7. Write .env ─────────────────────────────────────────────────────────────
SESSION_SECRET=$(openssl rand -hex 64)

if [[ -f "$APP_DIR/.env" ]]; then
  warn ".env already exists — skipping overwrite. Edit $APP_DIR/.env manually if needed."
else
  cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=$APP_PORT
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$SESSION_SECRET

# SMTP (optional — fill in to enable email alerts and password resets)
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=alerts@example.com
# SMTP_PASS=changeme
# SMTP_FROM_EMAIL=alerts@example.com
EOF
  chmod 600 "$APP_DIR/.env"
  info ".env written."
fi

# ── 8. Ownership ──────────────────────────────────────────────────────────────
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

# ── 9. Push database schema ───────────────────────────────────────────────────
info "Applying database schema..."
cd "$APP_DIR"
export $(grep -v '^#' .env | xargs)
npx drizzle-kit push --force || warn "Schema push had warnings — check manually if the app fails to start."

# ── 10. Systemd service ───────────────────────────────────────────────────────
info "Creating systemd service..."
cat > /etc/systemd/system/networkmonitor.service <<EOF
[Unit]
Description=SceptView Network Monitor
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/dist/index.cjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=networkmonitor

# Hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable networkmonitor
systemctl restart networkmonitor
sleep 2
systemctl is-active --quiet networkmonitor && info "Service started successfully." || \
  warn "Service may not have started — run: journalctl -u networkmonitor -n 50"

# ── 11. Nginx reverse proxy ───────────────────────────────────────────────────
info "Configuring Nginx..."
cat > /etc/nginx/sites-available/networkmonitor <<EOF
server {
    listen 80;
    server_name _;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/networkmonitor /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
info "Nginx configured."

# ── 12. Done ──────────────────────────────────────────────────────────────────
PUBLIC_IP=$(curl -sf --max-time 3 http://169.254.169.254/latest/meta-data/public-ipv4 || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  SceptView Network Monitor installed successfully!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  App URL     : http://$PUBLIC_IP"
echo -e "  Project dir : $APP_DIR"
echo -e "  Env file    : $APP_DIR/.env"
echo -e "  Logs        : journalctl -u networkmonitor -f"
echo -e "  Status      : systemctl status networkmonitor"
echo ""
echo -e "${YELLOW}  Next steps:${NC}"
echo -e "  1. Open port 80 (and 443) in your EC2 security group."
echo -e "  2. Visit http://$PUBLIC_IP — the first sign-up becomes admin."
echo -e "  3. (Optional) Add SMTP credentials to $APP_DIR/.env then:"
echo -e "     sudo systemctl restart networkmonitor"
echo -e "  4. (Optional) HTTPS: sudo apt install certbot python3-certbot-nginx"
echo -e "                        sudo certbot --nginx -d yourdomain.com"
echo ""
