-- Migration: Add missing columns to devices and device_interfaces tables
-- Run this script on self-hosted deployments (AWS/Vultr) if you see column-not-exist errors
-- Execute with: psql $DATABASE_URL -f scripts/add-missing-columns.sql

-- Add missing columns to devices table
ALTER TABLE devices ADD COLUMN IF NOT EXISTS total_checks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS successful_checks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS interface_index INTEGER NOT NULL DEFAULT 1;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS interface_name TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS active_users INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS poll_type TEXT NOT NULL DEFAULT 'snmp_only';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS max_bandwidth INTEGER NOT NULL DEFAULT 100;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS download_mbps TEXT NOT NULL DEFAULT '0.00';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS upload_mbps TEXT NOT NULL DEFAULT '0.00';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_in_counter TEXT NOT NULL DEFAULT '0';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_out_counter TEXT NOT NULL DEFAULT '0';

-- Add missing columns to device_interfaces table
ALTER TABLE device_interfaces ADD COLUMN IF NOT EXISTS total_checks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE device_interfaces ADD COLUMN IF NOT EXISTS successful_checks INTEGER NOT NULL DEFAULT 0;

-- Create device_links table if not exists
CREATE TABLE IF NOT EXISTS device_links (
  id SERIAL PRIMARY KEY,
  source_device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  source_interface_id INTEGER REFERENCES device_interfaces(id) ON DELETE SET NULL,
  target_device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  target_interface_id INTEGER REFERENCES device_interfaces(id) ON DELETE SET NULL,
  link_type TEXT NOT NULL DEFAULT 'manual',
  link_label TEXT,
  bandwidth_mbps INTEGER NOT NULL DEFAULT 1000,
  current_traffic_mbps TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'unknown',
  last_check TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Grant permissions (adjust username if needed)
GRANT ALL PRIVILEGES ON TABLE device_links TO PUBLIC;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;

-- Verify
SELECT 'Migration completed successfully!' AS status;
