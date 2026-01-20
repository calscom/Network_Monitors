# SceptView Network Monitor Dashboard

## Overview
This project is a real-time SNMP network monitoring dashboard designed to track device status and bandwidth utilization across multiple sites. It polls network devices via SNMP to display live status indicators (online/offline/recovering) and bandwidth utilization gauges. Devices are organized by site location, accessible through a tabbed interface. The application aims to provide a clear, concise overview of network health and performance.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Framework**: React 18 with TypeScript
- **State Management**: TanStack React Query for server state with 2-second polling
- **UI Components**: shadcn/ui library (built on Radix UI)
- **Styling**: Tailwind CSS with custom CSS variables for theming (dark mode, status colors)
- **Animations**: Framer Motion for smooth transitions
- **Routing**: Wouter for lightweight client-side routing

### Technical Implementations
- **Backend**: Node.js with Express.js and TypeScript (ES modules)
- **API**: RESTful endpoints using Zod for schema validation
- **SNMP Polling**: Background service using `net-snmp` for device metrics (e.g., `ifInOctets` for bandwidth, Mikrotik hotspot users)
- **Database**: PostgreSQL with Drizzle ORM for type-safe queries and schema management. Key entities include `devices`, `device_interfaces`, `users`, `sessions`, `logs`, `notification_settings`, `interface_metrics_history`, and `app_settings`.
- **Authentication**:
    - **Replit Environment**: Uses Replit Auth (OpenID Connect) with Google, GitHub, X, Apple, and email/password. New users default to 'viewer'.
    - **Self-Hosted**: Local username/password with bcrypt hashing. Initial setup creates an admin. Sessions stored in DB.
    - **Roles**: Admin (full access), Operator (device/site/settings management), Viewer (read-only).
- **Build System**: Vite for client-side, esbuild for server-side. `tsx` for development.

### Feature Specifications
- Real-time device status (online/offline/recovering)
- Bandwidth utilization gauges
- Device organization by site with tabbed navigation
- SNMP interface discovery and selection for monitoring
- Historical interface metrics for graphing
- Notification settings for alerts (email, Telegram) on offline, recovery, or high utilization events
- Period-over-period comparison data for performance analysis
- Network Map with multiple kiosk modes for wall-mounted NOC displays (see Kiosk Modes section)
- Email test functionality for SMTP verification
- CSV/Excel import/export with poll_type and max_bandwidth columns

### Network Map 7-Tier Grid Layout
Each site column displays devices organized into 7 vertical grid tiers:
- **Tier 0 (Top)**: PTP and PmPT devices (wireless links)
- **Tier 1**: ISP-PE and ISP-CE devices (provider edge/customer edge routers, Starlink)
- **Tier 2**: Fortigate firewalls (devices with type "fortigate" or names containing FW-, FORTI, FGT)
- **Tier 3**: MikroTik routers (devices with names containing RTR)
- **Tier 4**: Distribution switches (DST-01, DST-, DIST)
- **Tier 5**: Access switches (ACC-) - displayed in 1 row x 3 columns
- **Tier 6**: UAP access points - 5 columns for Maiduguri sites, 2 columns for other sites

Drag-and-drop editing mode allows manual repositioning of devices within their site column.

### Kiosk Modes

The application provides multiple kiosk modes optimized for different display scenarios:

#### Standard Kiosk Mode (`/kiosk`)
- **Technology**: React-based SPA with full UI framework
- **Memory Usage**: ~100MB RAM
- **Features**: Full network map with all skins (Classic Grid, Card Layout), real-time updates via React Query, smooth animations
- **Best For**: Modern displays with adequate memory (4GB+ RAM)
- **Customization**: Supports all network map skins and themes

#### Lightweight Kiosk Mode (`/kiosk-lite`)
- **Technology**: Pure HTML/CSS with no JavaScript framework
- **Memory Usage**: ~1-2MB RAM
- **Features**: 
  - Auto-refresh every 30 seconds via meta refresh tag
  - Responsive layout using viewport units (scales to any screen size)
  - Large 72px footer for visibility on wall-mounted displays
  - Maiduguri sites display in fixed 5-column grid
  - Color-coded device status (green=online, blue=recovering, red=offline)
- **Best For**: Low-memory devices like Raspberry Pi (512MB RAM)
- **Raspberry Pi Setup**:
  ```bash
  # Install minimal browser
  sudo apt install chromium-browser unclutter openbox xinit
  
  # Create autostart script
  mkdir -p ~/.config/openbox
  cat > ~/.config/openbox/autostart << 'EOF'
  unclutter -idle 0.5 -root &
  chromium-browser --kiosk --noerrdialogs --disable-infobars \
    --disable-session-crashed-bubble --incognito \
    http://your-server-ip:5000/kiosk-lite
  EOF
  
  # Auto-login to X on boot
  sudo raspi-config  # Enable auto-login to desktop
  ```

### Documentation
- **Operational Manual**: `Network_Monitor_Operational_Manual.docx` - Comprehensive user guide
- **Manual Generation**: Run `npx tsx scripts/generate-manual.ts` to regenerate after feature changes
- **Important**: Always update the manual when editing features by modifying `scripts/generate-manual.ts` and regenerating

## Database Migrations (Self-Hosted)

When deploying updates to self-hosted environments (AWS/Vultr), you may need to add new columns manually. Run these SQL commands if you encounter "column does not exist" errors:

```sql
-- Add max_bandwidth to devices table
ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_bandwidth integer DEFAULT 100 NOT NULL;

-- Add max_bandwidth to device_interfaces table
ALTER TABLE device_interfaces ADD COLUMN IF NOT EXISTS max_bandwidth integer DEFAULT 100 NOT NULL;

-- Add max_bandwidth to device_links table
ALTER TABLE device_links ADD COLUMN IF NOT EXISTS max_bandwidth integer DEFAULT 100 NOT NULL;

-- Add API credentials for MikroTik User Manager REST API polling
ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_username text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_password text;

-- Create user_sessions table for User Manager tracking
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  site TEXT NOT NULL,
  session_id TEXT,
  username TEXT NOT NULL,
  email TEXT,
  mac_address TEXT,
  ip_address TEXT,
  upload_bytes BIGINT DEFAULT 0 NOT NULL,
  download_bytes BIGINT DEFAULT 0 NOT NULL,
  session_start TIMESTAMP,
  session_end TIMESTAMP,
  is_active INTEGER DEFAULT 1 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create daily_user_stats table for graphing
CREATE TABLE IF NOT EXISTS daily_user_stats (
  id SERIAL PRIMARY KEY,
  device_id INTEGER REFERENCES devices(id),
  site TEXT NOT NULL,
  date TIMESTAMP NOT NULL,
  total_users INTEGER DEFAULT 0 NOT NULL,
  peak_users INTEGER DEFAULT 0 NOT NULL,
  total_upload_bytes BIGINT DEFAULT 0 NOT NULL,
  total_download_bytes BIGINT DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS user_sessions_device_id_idx ON user_sessions(device_id);
CREATE INDEX IF NOT EXISTS user_sessions_site_idx ON user_sessions(site);
CREATE INDEX IF NOT EXISTS user_sessions_created_at_idx ON user_sessions(created_at);
CREATE INDEX IF NOT EXISTS daily_user_stats_date_idx ON daily_user_stats(date);
CREATE INDEX IF NOT EXISTS daily_user_stats_site_idx ON daily_user_stats(site);
```

**Quick command for AWS:**
```bash
sudo -u postgres psql -d networkmonitor -c "ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_bandwidth integer DEFAULT 100 NOT NULL;"
sudo -u postgres psql -d networkmonitor -c "ALTER TABLE device_interfaces ADD COLUMN IF NOT EXISTS max_bandwidth integer DEFAULT 100 NOT NULL;"
sudo -u postgres psql -d networkmonitor -c "ALTER TABLE device_links ADD COLUMN IF NOT EXISTS max_bandwidth integer DEFAULT 100 NOT NULL;"
sudo -u postgres psql -d networkmonitor -c "ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_username text;"
sudo -u postgres psql -d networkmonitor -c "ALTER TABLE devices ADD COLUMN IF NOT EXISTS api_password text;"
sudo -u postgres psql -d networkmonitor -f /opt/networkmonitor/migrations/user_sessions.sql
sudo systemctl restart networkmonitor
```

## Uninstallation (Self-Hosted AWS/Vultr)

To completely remove the Network Monitor from your self-hosted server:

### Step 1: Stop and Disable the Service
```bash
sudo systemctl stop networkmonitor
sudo systemctl disable networkmonitor
sudo rm /etc/systemd/system/networkmonitor.service
sudo systemctl daemon-reload
```

### Step 2: Remove Application Files
```bash
sudo rm -rf /opt/networkmonitor
# Or wherever you installed the app
```

### Step 3: Drop the Database (Optional - Only if you want to remove all data)
```bash
# Drop the database and user
sudo -u postgres psql -c "DROP DATABASE IF EXISTS networkmonitor;"
sudo -u postgres psql -c "DROP USER IF EXISTS networkmonitor;"
```

### Step 4: Remove Nginx Configuration (if configured)
```bash
sudo rm /etc/nginx/sites-enabled/networkmonitor
sudo rm /etc/nginx/sites-available/networkmonitor
sudo nginx -t && sudo systemctl reload nginx
```

### Step 5: Remove SSL Certificates (if using Let's Encrypt)
```bash
sudo certbot delete --cert-name yourdomain.com
```

### Complete One-Liner for AWS/Vultr
```bash
sudo systemctl stop networkmonitor && sudo systemctl disable networkmonitor && sudo rm -f /etc/systemd/system/networkmonitor.service && sudo systemctl daemon-reload && sudo rm -rf /opt/networkmonitor && sudo -u postgres psql -c "DROP DATABASE IF EXISTS networkmonitor;" && sudo -u postgres psql -c "DROP USER IF EXISTS networkmonitor;" && echo "Network Monitor uninstalled successfully"
```

**Note**: If you only want to reinstall (keeping database data), skip Step 3.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.

### SNMP Monitoring
- **net-snmp**: Node.js library for SNMP polling.

### Email Service
- **nodemailer**: For SMTP email sending (welcome messages, password resets).

### UI Dependencies
- **Radix UI**: Accessible, unstyled primitives for UI components.
- **Lucide React**: Icon library.
- **date-fns**: Date formatting utilities.
- **react-day-picker**: Calendar component.
- **embla-carousel-react**: Carousel functionality.
- **vaul**: Drawer component.
- **cmdk**: Command palette component.
- **react-hook-form**: Form state management with Zod integration.

### Development Tools
- **Replit Plugins**: `vite-plugin-runtime-error-modal`, `vite-plugin-cartographer`, `vite-plugin-dev-banner` (development only).