-- SceptView Network Monitor - Sites Table Migration
-- Run this script on your self-hosted PostgreSQL database to add the sites feature

-- Create the sites table
CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Get all unique sites from existing devices and insert them
INSERT INTO sites (name, display_order)
SELECT DISTINCT site, ROW_NUMBER() OVER (ORDER BY site) as display_order
FROM devices
WHERE site IS NOT NULL AND site != ''
ON CONFLICT (name) DO NOTHING;

-- If no devices exist yet, insert default sites
INSERT INTO sites (name, display_order) VALUES
  ('01 Cloud', 1),
  ('02-Bauchi', 2),
  ('03-Gombe', 3),
  ('04-Kaduna', 4),
  ('05-Kano', 5),
  ('06-Katsina', 6),
  ('07-Kebbi', 7),
  ('08-Maiduguri', 8),
  ('09-Sokoto', 9),
  ('10-Yola', 10),
  ('11-Zaria', 11),
  ('12-Jos', 12)
ON CONFLICT (name) DO NOTHING;

-- Verify the migration
SELECT 'Sites table created successfully. Current sites:' as status;
SELECT id, name, display_order FROM sites ORDER BY display_order;
