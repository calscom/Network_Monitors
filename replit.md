# Network Monitor Dashboard

## Overview

A real-time SNMP network monitoring dashboard that tracks device status and bandwidth utilization across multiple sites. The application polls network devices via SNMP to display live status indicators (online/offline/recovering) and bandwidth utilization gauges. Devices are organized by site location with a tabbed interface for easy navigation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state with 2-second polling intervals for live updates
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming (dark mode, status colors)
- **Animations**: Framer Motion for smooth gauge transitions and status animations
- **Build Tool**: Vite with path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints defined in shared/routes.ts with Zod schema validation
- **SNMP Polling**: Background service using net-snmp library to poll device metrics at regular intervals
- **Database**: PostgreSQL with Drizzle ORM for type-safe queries

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: shared/schema.ts (shared between frontend and backend)
- **Migrations**: Generated via drizzle-kit to ./migrations folder
- **Key Entities**: devices table storing name, IP, SNMP community, type, status, utilization, bandwidth metrics, and timestamps

### API Structure
- `GET /api/devices` - List all devices with current status
- `POST /api/devices` - Create new device with validation
- `PATCH /api/devices/:id` - Update device settings (including interface selection)
- `DELETE /api/devices/:id` - Remove device by ID
- `POST /api/discover-interfaces` - Discover SNMP interfaces on a device (returns list with auto-uplink detection)
- `GET /api/devices/:id/monitored-interfaces` - Get list of monitored interfaces for a device
- `POST /api/devices/:id/monitored-interfaces` - Set interfaces to monitor (supports multiple)
- `GET /api/settings/notifications` - Get notification settings (admin only)
- `POST /api/settings/notifications` - Update notification settings (admin only)
- `POST /api/settings/notifications/test-telegram` - Send test message to Telegram (admin only)
- `GET /api/interfaces/:id/history` - Get historical metrics for a specific interface (for graphing)

### Build System
- **Development**: tsx for TypeScript execution, Vite dev server with HMR
- **Production**: esbuild bundles server code, Vite builds client to dist/public
- **Scripts**: `npm run dev` (development), `npm run build` (production build), `npm run db:push` (schema sync)

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via DATABASE_URL environment variable
- **connect-pg-simple**: Session storage for Express (available but may not be actively used)

### SNMP Monitoring
- **net-snmp**: Node.js library for SNMP polling to collect device metrics (ifInOctets OID for bandwidth)
- **Mikrotik Hotspot Users**: For Mikrotik devices, polls active hotspot/usermanager users via SNMP OID 1.3.6.1.4.1.9.9.150.1.1.1.0 (AAA sessions) with fallback to native Mikrotik hotspot table walk (1.3.6.1.4.1.14988.1.1.5.1.1.1)

### UI Dependencies
- **Radix UI**: Complete set of accessible, unstyled primitives (dialogs, dropdowns, tabs, etc.)
- **Lucide React**: Icon library
- **date-fns**: Date formatting utilities
- **react-day-picker**: Calendar component
- **embla-carousel-react**: Carousel functionality
- **vaul**: Drawer component
- **cmdk**: Command palette component
- **react-hook-form**: Form state management with @hookform/resolvers for Zod integration

### Development Tools
- **Replit Plugins**: vite-plugin-runtime-error-modal, vite-plugin-cartographer, vite-plugin-dev-banner (development only)

## Authentication & Authorization

### User Roles
- **Admin**: Full access including user management, device management, site configuration, and settings
- **Operator**: Can manage devices, sites, and settings, but cannot manage other users
- **Viewer**: Read-only access to view the monitoring dashboard and download device lists

### Auth Flow
- **On Replit**: Uses Replit Auth (OpenID Connect) supporting Google, GitHub, X, Apple, and email/password. New users default to 'viewer' role. Admins can promote users via User Management page.
- **Self-Hosted**: Authentication is automatically disabled when `REPL_ID` environment variable is not present. All users are treated as admins with full access. This is ideal for internal network monitoring tools.

### Conditional Auth Implementation
- `isReplitEnvironment` check in `server/routes.ts` detects Replit platform via `REPL_ID` env var
- `conditionalAuth` middleware bypasses authentication on self-hosted deployments
- `requireRole` middleware grants admin access to all users when self-hosted

## Deployment Guide (Vultr/AWS EC2)

### Prerequisites
- Ubuntu 22.04 LTS server
- Node.js 20.x
- PostgreSQL 14+

### Quick Setup
```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install tsx globally (required for build)
npm install -g tsx

# Clone and install
git clone <repo-url> /opt/networkmonitor
cd /opt/networkmonitor
npm install

# Set environment variables
export DATABASE_URL=postgresql://user:pass@localhost:5432/networkmonitor
export SESSION_SECRET=your_random_32_char_string
export NODE_ENV=production

# Build and run
npm run build
npm run db:push
node dist/index.js
```

### Database Setup (Manual SQL)
If db:push fails, create tables manually:
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
  site TEXT NOT NULL,
  total_checks INTEGER DEFAULT 0 NOT NULL,
  successful_checks INTEGER DEFAULT 0 NOT NULL,
  interface_index INTEGER DEFAULT 1 NOT NULL,
  interface_name TEXT
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

CREATE TABLE device_interfaces (
  id SERIAL PRIMARY KEY,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  interface_index INTEGER NOT NULL,
  interface_name TEXT,
  is_primary INTEGER DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'unknown',
  utilization INTEGER DEFAULT 0,
  download_mbps TEXT DEFAULT '0.00',
  upload_mbps TEXT DEFAULT '0.00',
  last_in_counter BIGINT DEFAULT 0,
  last_out_counter BIGINT DEFAULT 0,
  last_check TIMESTAMP
);

CREATE TABLE notification_settings (
  id SERIAL PRIMARY KEY,
  email_enabled INTEGER DEFAULT 0 NOT NULL,
  email_recipients TEXT,
  telegram_enabled INTEGER DEFAULT 0 NOT NULL,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  notify_on_offline INTEGER DEFAULT 1 NOT NULL,
  notify_on_recovery INTEGER DEFAULT 1 NOT NULL,
  notify_on_high_utilization INTEGER DEFAULT 0 NOT NULL,
  utilization_threshold INTEGER DEFAULT 90 NOT NULL,
  cooldown_minutes INTEGER DEFAULT 5 NOT NULL,
  last_notification_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE interface_metrics_history (
  id SERIAL PRIMARY KEY,
  interface_id INTEGER REFERENCES device_interfaces(id) NOT NULL,
  device_id INTEGER REFERENCES devices(id) NOT NULL,
  site TEXT NOT NULL,
  interface_name TEXT,
  utilization INTEGER DEFAULT 0 NOT NULL,
  download_mbps TEXT DEFAULT '0' NOT NULL,
  upload_mbps TEXT DEFAULT '0' NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL
);
```

### Database Migrations (Existing Installations)
If you're upgrading an existing installation, run these SQL commands:
```sql
-- Added for availability tracking
ALTER TABLE devices ADD COLUMN IF NOT EXISTS total_checks INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS successful_checks INTEGER DEFAULT 0 NOT NULL;

-- Added for SNMP interface selection
ALTER TABLE devices ADD COLUMN IF NOT EXISTS interface_index INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS interface_name TEXT;

-- Device interfaces table (for multi-interface monitoring)
CREATE TABLE IF NOT EXISTS device_interfaces (
  id SERIAL PRIMARY KEY,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  interface_index INTEGER NOT NULL,
  interface_name TEXT,
  is_primary INTEGER DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'unknown',
  utilization INTEGER DEFAULT 0,
  download_mbps TEXT DEFAULT '0.00',
  upload_mbps TEXT DEFAULT '0.00',
  last_in_counter BIGINT DEFAULT 0,
  last_out_counter BIGINT DEFAULT 0,
  last_check TIMESTAMP
);

-- Notification settings table (for alerts)
CREATE TABLE IF NOT EXISTS notification_settings (
  id SERIAL PRIMARY KEY,
  email_enabled INTEGER DEFAULT 0 NOT NULL,
  email_recipients TEXT,
  telegram_enabled INTEGER DEFAULT 0 NOT NULL,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  notify_on_offline INTEGER DEFAULT 1 NOT NULL,
  notify_on_recovery INTEGER DEFAULT 1 NOT NULL,
  notify_on_high_utilization INTEGER DEFAULT 0 NOT NULL,
  utilization_threshold INTEGER DEFAULT 90 NOT NULL,
  cooldown_minutes INTEGER DEFAULT 5 NOT NULL,
  last_notification_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Interface metrics history (for graphing secondary interfaces)
CREATE TABLE IF NOT EXISTS interface_metrics_history (
  id SERIAL PRIMARY KEY,
  interface_id INTEGER REFERENCES device_interfaces(id) NOT NULL,
  device_id INTEGER REFERENCES devices(id) NOT NULL,
  site TEXT NOT NULL,
  interface_name TEXT,
  utilization INTEGER DEFAULT 0 NOT NULL,
  download_mbps TEXT DEFAULT '0' NOT NULL,
  upload_mbps TEXT DEFAULT '0' NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL
);
```

### Grant Permissions (Important for Self-Hosted)
After creating tables, grant permissions to your database user:
```sql
-- Replace 'your_db_user' with your actual database username
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_db_user;

-- Or grant individually for each table:
GRANT ALL PRIVILEGES ON devices TO your_db_user;
GRANT ALL PRIVILEGES ON logs TO your_db_user;
GRANT ALL PRIVILEGES ON users TO your_db_user;
GRANT ALL PRIVILEGES ON sessions TO your_db_user;
GRANT ALL PRIVILEGES ON device_interfaces TO your_db_user;
GRANT ALL PRIVILEGES ON notification_settings TO your_db_user;
GRANT ALL PRIVILEGES ON interface_metrics_history TO your_db_user;

-- And sequences:
GRANT USAGE, SELECT ON SEQUENCE devices_id_seq TO your_db_user;
GRANT USAGE, SELECT ON SEQUENCE logs_id_seq TO your_db_user;
GRANT USAGE, SELECT ON SEQUENCE device_interfaces_id_seq TO your_db_user;
GRANT USAGE, SELECT ON SEQUENCE notification_settings_id_seq TO your_db_user;
GRANT USAGE, SELECT ON SEQUENCE interface_metrics_history_id_seq TO your_db_user;
```

### Network Requirements
- Outbound UDP port 161 for SNMP polling
- Inbound TCP port 5000 (or 80/443 with reverse proxy)
- Deploy inside VPC for access to internal network devices

### Systemd Service (Optional)
Create `/etc/systemd/system/networkmonitor.service`:
```ini
[Unit]
Description=Network Monitor Dashboard
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/networkmonitor
Environment=NODE_ENV=production
Environment=DATABASE_URL=postgresql://user:pass@localhost:5432/networkmonitor
Environment=SESSION_SECRET=your_random_32_char_string
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable networkmonitor
sudo systemctl start networkmonitor
```