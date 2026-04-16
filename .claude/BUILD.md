# PhantomOS — Build & Distribution Guide

> Author: Subash Karki

## Prerequisites

- macOS (Apple Silicon)
- Bun 1.3+ (`bun --version`)
- Node.js 22+ (`node --version`)

## Development

```bash
# Install dependencies
bun install

# Start dev (server + desktop together)
bun run dev

# Start just the API server
bun run dev:api

# Start just the desktop app
bun run dev:desktop
```

Dev server runs on `http://localhost:3849`, renderer on `http://localhost:3850`.

## Building a DMG

```bash
bun run dist:mac
```

This runs three steps:
1. **Cleans** `apps/desktop/release/` and `packages/server/dist/`
2. **Builds** the server bundle (`packages/server/dist/index.cjs`) and renderer via electron-vite
3. **Packages** into `.app` + `.dmg` via electron-builder, rebuilding native modules (`better-sqlite3`, `node-pty`) for Electron's Node ABI

Output: `apps/desktop/release/PhantomOS-{version}-arm64.dmg`

### Verifying the build

```bash
# Check server bundle has all routes
grep -c "// src/routes/" packages/server/dist/index.cjs
# Should be 25+

# Check native modules are arm64
file apps/desktop/release/mac-arm64/PhantomOS.app/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node
file apps/desktop/release/mac-arm64/PhantomOS.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node
# Both should say: Mach-O 64-bit bundle arm64

# Launch from terminal to see server logs
xattr -cr apps/desktop/release/mac-arm64/PhantomOS.app
apps/desktop/release/mac-arm64/PhantomOS.app/Contents/MacOS/PhantomOS
# Look for: "[PhantomOS Desktop] API server is ready"
```

### Installing for testing

```bash
# Mount DMG, copy to Applications
hdiutil attach apps/desktop/release/PhantomOS-1.0.0-arm64.dmg -nobrowse
cp -R "/Volumes/PhantomOS 1.0.0/PhantomOS.app" /Applications/
hdiutil detach "/Volumes/PhantomOS 1.0.0"

# Clear quarantine + provenance (required for unsigned builds)
xattr -cr /Applications/PhantomOS.app
xattr -dr com.apple.provenance /Applications/PhantomOS.app

# Launch
open /Applications/PhantomOS.app
```

### Resetting for fresh user testing

```bash
# Clear all preferences (triggers onboarding)
sqlite3 ~/.phantom-os/phantom.db "DELETE FROM user_preferences;"

# Clear just the tour (re-triggers guided tour)
sqlite3 ~/.phantom-os/phantom.db "DELETE FROM user_preferences WHERE key='tour_completed';"
```

## Known Build Issues

### Stale server bundle (turbo cache)
Turbo may cache the server build and reuse a stale `index.cjs`. The `dist:mac` script cleans `packages/server/dist/` before each build. If you suspect a stale bundle, run manually:
```bash
node scripts/build-server.mjs
```

### NODE_MODULE_VERSION mismatch
If you see `was compiled against a different Node.js version`, the native modules weren't rebuilt for Electron's ABI. The `afterPack` hook (`apps/desktop/scripts/rebuild-native.cjs`) handles this. Check `node-gyp` output in the build logs.

### posix_spawnp failed (terminal won't open)
`node-pty`'s `spawn-helper` binary may be blocked by macOS quarantine. Fix:
```bash
xattr -dr com.apple.provenance /Applications/PhantomOS.app
```

## Key Build Files

| File | Purpose |
|------|---------|
| `scripts/build-server.mjs` | Bundles server to CJS, renames to `.cjs` |
| `apps/desktop/electron-builder.yml` | Electron packaging config (DMG, asar, extraResources) |
| `apps/desktop/scripts/rebuild-native.cjs` | afterPack hook — rebuilds native modules for Electron ABI |
| `apps/desktop/resources/server-preload.cjs` | Runtime hook — redirects native module requires to unpacked dir |
| `apps/desktop/build/entitlements.mac.plist` | macOS entitlements (JIT, network, file access) |

## Architecture (Production)

```
Electron main process
  → utilityProcess.fork('server-preload.cjs')
    → hooks Module._resolveFilename for native modules
    → requires server/index.cjs (Bun-bundled Hono server)
    → Server boots on :3849 (REST, SSE, WebSocket)
  → BrowserWindow loads renderer
    → Proxies /api/* to localhost:3849
    → SSE for live updates, WebSocket for terminal PTY
```
