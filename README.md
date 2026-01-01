# Network Monitor Dashboard

A real-time SNMP network monitoring dashboard that tracks device status and bandwidth utilization across multiple sites.

## Features

- Real-time SNMP polling for device status monitoring
- Download/upload speed tracking in Mbps
- Bandwidth utilization gauges with visual indicators
- Multi-site organization with tabbed navigation
- Activity logs for status changes and events
- Network topology map view
- CSV/Excel import/export for devices and sites
- Role-based access control (Admin, Operator, Viewer)
- Dark/Light theme support
- Responsive design for mobile and desktop

## Requirements

- Node.js 20.x or higher
- PostgreSQL 14+
- Network access to SNMP-enabled devices (UDP port 161)

## Quick Start (Development)

```bash
# Clone the repository
git clone <your-repo-url>
cd networkmonitor

# Install dependencies
npm install

# Set environment variables
export DATABASE_URL=postgresql://user:password@localhost:5432/networkmonitor
export SESSION_SECRET=your_random_32_character_string

# Push database schema
npm run db:push

# Start development server
npm run dev
```

The app will be available at `http://localhost:5000`

## Production Deployment

### Option 1: Vultr VPS

#### Step 1: Create Server
- Deploy Ubuntu 22.04 LTS on Vultr
- Attach to your VPC 2.0 network for internal device access
- Minimum: 1 vCPU, 1GB RAM

#### Step 2: Install Dependencies
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Install Git and build tools
apt install -y git
npm install -g tsx
```

#### Step 3: Setup Database
```bash
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE USER networkmonitor WITH PASSWORD 'your_secure_password';
CREATE DATABASE networkmonitor OWNER networkmonitor;
GRANT ALL PRIVILEGES ON DATABASE networkmonitor TO networkmonitor;
\q
```

#### Step 4: Deploy Application
```bash
# Clone repository
git clone <your-repo-url> /opt/networkmonitor
cd /opt/networkmonitor

# Install dependencies
npm install

# Create environment file
cat > .env << 'EOF'
DATABASE_URL=postgresql://networkmonitor:your_secure_password@localhost:5432/networkmonitor
SESSION_SECRET=your_random_32_character_string
NODE_ENV=production
PORT=5000
EOF

# Build application
npm run build

# Setup database (try db:push first, use manual SQL if it fails)
npm run db:push
```

#### Step 5: Create Systemd Service
```bash
cat > /etc/systemd/system/networkmonitor.service << 'EOF'
[Unit]
Description=Network Monitor Dashboard
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/networkmonitor
EnvironmentFile=/opt/networkmonitor/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable networkmonitor
systemctl start networkmonitor
```

#### Step 6: Configure Firewall
```bash
ufw allow 22/tcp
ufw allow 5000/tcp
ufw enable
```

### Option 2: AWS EC2

Follow the same steps as Vultr, with these AWS-specific considerations:

1. **Security Groups**: Allow inbound TCP 5000 (or 80/443) and outbound UDP 161
2. **VPC**: Deploy in a VPC with access to your network devices
3. **IAM**: No special IAM permissions needed for basic deployment

### Database Manual Setup

If `npm run db:push` fails, create tables manually:

```sql
CREATE TABLE devices (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  ip TEXT NOT NULL,
  community TEXT DEFAULT 'public' NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'unknown' NOT NULL,
  utilization INTEGER DEFAULT 0 NOT NULL,
  bandwidth_mbps TEXT DEFAULT '0' NOT NULL,
  download_mbps TEXT DEFAULT '0' NOT NULL,
  upload_mbps TEXT DEFAULT '0' NOT NULL,
  last_in_counter BIGINT DEFAULT 0 NOT NULL,
  last_out_counter BIGINT DEFAULT 0 NOT NULL,
  last_check TIMESTAMP,
  last_seen TIMESTAMP,
  site TEXT NOT NULL
);

CREATE TABLE logs (
  id SERIAL PRIMARY KEY,
  device_id INTEGER REFERENCES devices(id),
  site TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  profile_image_url TEXT,
  role VARCHAR(20) DEFAULT 'viewer',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
  sid VARCHAR(255) PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX idx_sessions_expire ON sessions(expire);
```

## Authentication

### On Replit
The app uses Replit Auth (OpenID Connect) which supports Google, GitHub, Apple, and email login. New users are automatically assigned the 'viewer' role.

### Self-Hosted (Vultr/AWS/etc.)
**Authentication is automatically disabled** for self-hosted deployments. When the app detects it's not running on Replit (no `REPL_ID` environment variable), all users are granted admin access without login.

This is ideal for internal network monitoring tools. If you need authentication for self-hosted deployments, you can:
1. Set up a reverse proxy with basic auth (Nginx)
2. Use a VPN to restrict network access
3. Implement custom authentication (modify `server/routes.ts`)

## User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: manage users, devices, sites, and settings |
| **Operator** | Manage devices, sites, and settings (no user management) |
| **Viewer** | Read-only: view dashboard and download device lists |

### Setting First Admin (Replit only)

After first login on Replit, run this SQL to make yourself admin:
```sql
UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SESSION_SECRET` | Random string for session encryption | Yes |
| `NODE_ENV` | `development` or `production` | No |
| `PORT` | Server port (default: 5000) | No |

### SNMP Settings

- Default community string: `public`
- Polling interval: Configurable via UI (5s to 5min)
- Supported device types: MikroTik, UniFi, Fortigate, Cisco, D-Link, IoT devices

## Network Requirements

- **Outbound UDP 161**: For SNMP polling to network devices
- **Inbound TCP 5000**: For web dashboard access (or 80/443 with reverse proxy)

## Reverse Proxy (Optional)

For production, use Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Useful Commands

```bash
# View logs
journalctl -u networkmonitor -f

# Restart service
systemctl restart networkmonitor

# Update application
cd /opt/networkmonitor
git pull
npm install
npm run build
systemctl restart networkmonitor
```

## Troubleshooting

### SNMP Timeouts
- Verify device IP is reachable from server
- Check SNMP community string is correct
- Ensure UDP 161 is not blocked by firewall

### Database Connection Issues
- Verify PostgreSQL is running: `systemctl status postgresql`
- Check DATABASE_URL format is correct
- Ensure database user has proper permissions

### Build Errors
- Ensure Node.js 20+ is installed: `node --version`
- Install tsx globally: `npm install -g tsx`
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`

## License

MIT License
