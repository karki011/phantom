#!/bin/bash
# Patch Electron.app's Info.plist so macOS dock shows "PhantomOS" in dev mode.
# Runs automatically via postinstall.
# @author Subash Karki

ELECTRON_DIR=$(find node_modules -path "*/electron/dist/Electron.app/Contents/Info.plist" 2>/dev/null | head -1)

if [ -n "$ELECTRON_DIR" ]; then
  plutil -replace CFBundleDisplayName -string "PhantomOS" "$ELECTRON_DIR" 2>/dev/null
  plutil -replace CFBundleName -string "PhantomOS" "$ELECTRON_DIR" 2>/dev/null
  echo "[patch-electron-name] Dock name set to PhantomOS"
else
  echo "[patch-electron-name] Electron.app not found, skipping"
fi
