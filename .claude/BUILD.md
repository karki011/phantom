# PhantomOS — Build & Distribution Guide

> Author: Subash Karki

## Prerequisites

- macOS (Apple Silicon)
- Bun 1.3+ (`bun --version`)
- Node.js 22+ (`node --version`)

## Development

```bash
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

### Ad-hoc (internal testing, teammates on your machine)

```bash
bun run dist:mac
```

This runs, in order:

1. **Clean** `apps/desktop/release/` and `packages/server/dist/`
2. **Build** the server bundle (`packages/server/dist/index.cjs`) and the renderer (via electron-vite)
3. **Package** into `.app` + `.dmg` via electron-builder. The `afterPack` hook (`apps/desktop/scripts/rebuild-native.cjs`) then:
   - Rebuilds `better-sqlite3` and `node-pty` against Electron's Node ABI
   - Ad-hoc codesigns `spawn-helper` (required by macOS for `posix_spawn`)
   - Patches `node-pty/lib/unixTerminal.js` to make the `app.asar → app.asar.unpacked` rewrite idempotent (see *Known Build Issues*)

Output: `apps/desktop/release/PhantomOS-{version}-arm64.dmg`. The ad-hoc DMG is what teammates need the `xattr` dance for.

### Signed + notarized (public distribution)

One-time setup:

1. Enroll in the Apple Developer Program (~$99/yr).
2. Install a **Developer ID Application** certificate into your login Keychain (Xcode → Settings → Accounts → Manage Certificates → `+` → Developer ID Application).
3. Generate an app-specific password at https://appleid.apple.com → Sign-In and Security → App-Specific Passwords.
4. Grab your Team ID from https://developer.apple.com/account → Membership.
5. Copy `.env.notarize.example` → `.env.notarize` and fill in `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. The file is gitignored.

Every release:

```bash
bash scripts/release-mac.sh
```

This wrapper loads `.env.notarize`, confirms the certificate is in Keychain, runs `bun run dist:mac` (which electron-builder detects as signed + notarized because the env vars are present), probes routes, and validates the notarization ticket. Teammates can then double-click the DMG with no Terminal dance.

If `.env.notarize` isn't present, `release-mac.sh` silently falls back to the ad-hoc build — the script is safe to run either way.

### Full verify → install → launch flow

```bash
# 1. Free port 3849 if a dev server is running — the bundle binds :3849
lsof -tiTCP:3849 | xargs kill 2>/dev/null

# 2. Build
bun run dist:mac

# 3. Static checks — all routes bundled, native modules arm64
grep -c "// src/routes/" packages/server/dist/index.cjs   # → 25
file apps/desktop/release/mac-arm64/PhantomOS.app/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node
file apps/desktop/release/mac-arm64/PhantomOS.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node
# Both should say: Mach-O 64-bit bundle arm64

# 4. Live route probe — launches the packaged .app, GETs every API route
bash scripts/verify-bundle.sh

# 5. Install to /Applications
pkill -x PhantomOS 2>/dev/null
rm -rf /Applications/PhantomOS.app
hdiutil attach apps/desktop/release/PhantomOS-1.0.0-arm64.dmg -nobrowse -quiet
cp -R "/Volumes/PhantomOS 1.0.0/PhantomOS.app" /Applications/
hdiutil detach "/Volumes/PhantomOS 1.0.0" -quiet

# 6. Clear macOS quarantine/provenance (required — unsigned ad-hoc builds)
xattr -cr /Applications/PhantomOS.app
xattr -dr com.apple.provenance /Applications/PhantomOS.app

# 7. Re-sign spawn-helper (xattrs sometimes re-apply on copy)
codesign --force --sign - /Applications/PhantomOS.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/build/Release/spawn-helper

# 8. Launch
open /Applications/PhantomOS.app
```

### What `scripts/verify-bundle.sh` does

- Launches the packaged `.app` from `apps/desktop/release/mac-arm64/`
- Polls `http://127.0.0.1:3849/api/hunter` until the server is ready
- GETs one endpoint per route module (24 in total)
- Fails on 5xx / connection refused. 404 is treated as "route mounted, just no data for dummy id" and is OK.
- Tears down the launched app on exit.

Run it after every `bun run dist:mac` — it catches broken route wiring, server-bundle misbundles, and native-module load failures.

### Launching directly from the build tree (skip install)

```bash
xattr -cr apps/desktop/release/mac-arm64/PhantomOS.app
apps/desktop/release/mac-arm64/PhantomOS.app/Contents/MacOS/PhantomOS
# Look for: "[PhantomOS Desktop] API server is ready"
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

Turbo may cache the server build and reuse a stale `index.cjs`. The `dist:mac` script cleans `packages/server/dist/` before each build. If you suspect a stale bundle, run the bundler manually:

```bash
node scripts/build-server.mjs
```

### NODE_MODULE_VERSION mismatch

If you see `was compiled against a different Node.js version`, the native modules weren't rebuilt for Electron's ABI. The `afterPack` hook handles this. Check `node-gyp` output in the build logs.

### "Failed to spawn terminal: posix_spawnp failed."

Three historical causes, all now handled automatically by `rebuild-native.cjs`:

1. **Quarantine/provenance on `spawn-helper`** — removed at install time via `xattr -dr com.apple.provenance ...`.
2. **`spawn-helper` not ad-hoc signed** — `afterPack` runs `codesign --force --sign -` on it.
3. **Doubled `.unpacked` path** (the real one). `node-pty/lib/unixTerminal.js` does an unconditional `helperPath.replace('app.asar', 'app.asar.unpacked')`. Our `server-preload.cjs` already resolves node-pty from the unpacked dir, so the path starts as `.../app.asar.unpacked/...` and this rewrite turned it into `.../app.asar.unpacked.unpacked/...` — `posix_spawn` hit ENOENT and surfaced as the vague `posix_spawnp failed`. `afterPack` now rewrites the replace calls to use a negative-lookahead regex so they're idempotent.

If you see this error on a new build, check: `grep "helperPath.replace" /Applications/PhantomOS.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/lib/unixTerminal.js` — it should contain `(?!\.unpacked)`.

### All API calls resolve to `file:///api/...` in the bundle

Renderer was loaded via `file://` and the fetch calls were relative. Two-part fix (already in the codebase):

- `apps/desktop/src/renderer/index.html` has an inline script that sets `window.__PHANTOM_API_BASE = 'http://localhost:3849'` **before** any module runs. This is what packages like `@phantom-os/panes` and `@phantom-os/terminal` read at module-init time.
- All raw `fetch('/api/...')` callsites in the renderer now prefix with `${API_BASE}` from `lib/api.ts`.

If a new file regresses this, grep: `grep -rnE "fetch\(\`/api/|fetch\('/api/|fetch\(\"/api/" apps/desktop/src/renderer packages --include='*.ts' --include='*.tsx'` — should return nothing.

## Key Build Files

| File | Purpose |
|------|---------|
| `scripts/build-server.mjs` | Bundles the server to CJS, renames to `.cjs` |
| `scripts/verify-bundle.sh` | Launches the packaged `.app` and probes every API route |
| `apps/desktop/electron-builder.yml` | Electron packaging config (DMG, asar, extraResources) |
| `apps/desktop/scripts/rebuild-native.cjs` | afterPack hook — rebuilds native modules, codesigns spawn-helper, patches `unixTerminal.js` |
| `apps/desktop/resources/server-preload.cjs` | Runtime hook — redirects native module requires to unpacked dir |
| `apps/desktop/build/entitlements.mac.plist` | macOS entitlements (JIT, network, file access, library validation disabled) |
| `apps/desktop/src/main/server.ts` | Spawns the API server in prod via `child_process.spawn(process.execPath, ..., { env: { ELECTRON_RUN_AS_NODE: '1' } })` |
| `apps/desktop/src/renderer/index.html` | Inline script sets `window.__PHANTOM_API_BASE` before modules load |

## Architecture (Production)

```
Electron main process (/Applications/PhantomOS.app/Contents/MacOS/PhantomOS)
  → child_process.spawn(process.execPath, ['server-preload.cjs'],
                        env: { ELECTRON_RUN_AS_NODE: '1' })
    (used instead of utilityProcess.fork — the utility-process sandbox
     blocks posix_spawn, which node-pty needs for terminals)
      → server-preload.cjs
        → hooks Module._resolveFilename for native modules (better-sqlite3, node-pty)
        → requires server/index.cjs (Bun-bundled Hono server)
        → Server boots on :3849 (REST, SSE, WebSocket)
  → BrowserWindow loads renderer from file://
    → index.html inline script sets window.__PHANTOM_API_BASE = 'http://localhost:3849'
    → Renderer fetches go to http://localhost:3849 (no dev proxy in prod)
    → SSE for live updates, WebSocket for terminal PTY
```
