-- Migration: Create device_links table for network topology
-- Run this script on self-hosted deployments (AWS/Vultr) to enable device link management
-- Execute with: psql $DATABASE_URL -f scripts/create-device-links.sql

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

-- Verify table was created
SELECT 'device_links table created successfully' AS status;
