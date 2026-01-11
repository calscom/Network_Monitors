#!/bin/bash
# SceptView Network Monitor - Sites Table Migration Script
# Usage: ./migrate-sites.sh

echo "=== SceptView Sites Migration ==="

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  echo "Please set it with: export DATABASE_URL='your_postgres_connection_string'"
  exit 1
fi

echo "Running migration..."
psql "$DATABASE_URL" -f "$(dirname "$0")/migrate-sites.sql"

if [ $? -eq 0 ]; then
  echo ""
  echo "=== Migration completed successfully! ==="
  echo "Please restart your application service now."
else
  echo ""
  echo "=== Migration failed! ==="
  echo "Please check the error messages above."
  exit 1
fi
