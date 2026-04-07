#!/usr/bin/env bash
# PhantomOS — Start Script
# Author: Subash Karki

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "PhantomOS — The System"
echo "======================"

# Check if already running
if lsof -ti:3850 >/dev/null 2>&1; then
  echo "PhantomOS is already running!"
  echo "  UI:  http://localhost:3850"
  echo "  API: http://localhost:3849"
  exit 0
fi

# Kill any stale processes on our ports
lsof -ti:3849 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:3850 2>/dev/null | xargs kill -9 2>/dev/null || true

# Start API server
echo "Starting API server on :3849..."
pnpm --filter @phantom-os/server dev:api &
API_PID=$!

# Wait for API to be ready
sleep 2

# Start Vite dev server
echo "Starting UI on :3850..."
pnpm --filter @phantom-os/web dev &
UI_PID=$!

sleep 2
open http://localhost:3850

echo ""
echo "PhantomOS is running:"
echo "  UI:  http://localhost:3850"
echo "  API: http://localhost:3849"
echo ""
echo "Press Ctrl+C to stop"

# Trap cleanup
cleanup() {
  echo ""
  echo "Shutting down PhantomOS..."
  kill $API_PID 2>/dev/null || true
  kill $UI_PID 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM
wait
