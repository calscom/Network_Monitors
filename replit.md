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
- Network Map with kiosk mode (/kiosk) for wall-mounted NOC displays
- Email test functionality for SMTP verification
- CSV/Excel import/export with poll_type and max_bandwidth columns

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
```

**Quick command for AWS:**
```bash
sudo -u postgres psql -d networkmonitor -c "ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_bandwidth integer DEFAULT 100 NOT NULL;"
sudo -u postgres psql -d networkmonitor -c "ALTER TABLE device_interfaces ADD COLUMN IF NOT EXISTS max_bandwidth integer DEFAULT 100 NOT NULL;"
sudo -u postgres psql -d networkmonitor -c "ALTER TABLE device_links ADD COLUMN IF NOT EXISTS max_bandwidth integer DEFAULT 100 NOT NULL;"
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