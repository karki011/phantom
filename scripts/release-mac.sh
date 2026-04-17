#!/usr/bin/env bash
# Build a signed + notarized PhantomOS DMG for distribution.
#
# Usage:
#   bash scripts/release-mac.sh
#
# Requires a .env.notarize file at the repo root containing:
#   APPLE_ID=you@example.com
#   APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
#   APPLE_TEAM_ID=ABCD123456
#
# AND a "Developer ID Application" certificate installed in the login Keychain.
#
# Falls back gracefully: if the .env.notarize file is missing, runs the normal
# ad-hoc build (same as `bun run dist:mac`), so CI / quick local builds still work.

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE="$REPO_ROOT/.env.notarize"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  echo "[release] loaded credentials from $ENV_FILE"
  echo "[release] team: ${APPLE_TEAM_ID:-?}   apple id: ${APPLE_ID:-?}"

  missing=()
  [[ -z "${APPLE_ID:-}" ]] && missing+=("APPLE_ID")
  [[ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]] && missing+=("APPLE_APP_SPECIFIC_PASSWORD")
  [[ -z "${APPLE_TEAM_ID:-}" ]] && missing+=("APPLE_TEAM_ID")
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "[release] error: missing env vars: ${missing[*]}" >&2
    exit 2
  fi

  # Confirm the cert is in Keychain (electron-builder will error cryptically otherwise)
  if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
    echo "[release] error: no 'Developer ID Application' certificate in login Keychain" >&2
    echo "[release] install via Xcode → Settings → Accounts → Manage Certificates → + → Developer ID Application" >&2
    exit 3
  fi

  echo "[release] running signed + notarized build"
else
  echo "[release] $ENV_FILE not found — running ad-hoc build (teammates will need xattr dance)"
fi

cd "$REPO_ROOT"
bun run dist:mac

echo
echo "[release] build complete. verifying routes..."
bash "$REPO_ROOT/scripts/verify-bundle.sh"

echo
echo "[release] verifying signature"
APP=""
for d in "$REPO_ROOT/apps/desktop/release/mac-universal" "$REPO_ROOT/apps/desktop/release/mac-arm64" "$REPO_ROOT/apps/desktop/release/mac"; do
  if [[ -d "$d/PhantomOS.app" ]]; then APP="$d/PhantomOS.app"; break; fi
done
if [[ -z "$APP" ]]; then echo "[release] error: no .app found" >&2; exit 4; fi
codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | tail -5

if [[ -f "$ENV_FILE" ]]; then
  echo
  echo "[release] verifying notarization ticket (stapled)"
  xcrun stapler validate "$APP" || echo "[release] warning: stapler validation failed — app may still work but teammates will see a network check on first launch"
fi

echo
DMG=$(ls "$REPO_ROOT/apps/desktop/release/"*.dmg 2>/dev/null | head -1)
echo "[release] ready: $DMG"
