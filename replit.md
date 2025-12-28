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
- `DELETE /api/devices/:id` - Remove device by ID

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