#!/usr/bin/env bash
# PhantomOS — Start Script (Electron-only)
# Author: Subash Karki

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "PhantomOS — The System"
echo "======================"

# Start the desktop app via turbo (launches server + Electron)
echo "Starting Electron desktop app..."
bun run dev:desktop
