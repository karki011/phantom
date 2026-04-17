---
name: build-dmg
description: Build, verify, and install the PhantomOS macOS DMG. Use when the user asks to "create a DMG", "build the app", "package PhantomOS", "install the build", "make a release", or troubleshoots the packaged `.app` (terminal won't spawn, routes 404, `file:///api/...` errors).
---

# Build PhantomOS DMG 

Authoritative reference: `.claude/BUILD.md`. Read it if you need the *why* behind any step.

## The one command

**Internal / ad-hoc build** (teammates need the xattr dance to launch):

```bash
bun run dist:mac
```

**Signed + notarized build** (teammates double-click, no Terminal):

```bash
bash scripts/release-mac.sh
```

Requires `.env.notarize` with `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, plus a "Developer ID Application" cert in login Keychain. `release-mac.sh` falls back to ad-hoc if `.env.notarize` is missing. See `.env.notarize.example` and BUILD.md for setup.

Either command cleans, builds server + renderer, rebuilds native modules, ad-hoc signs `spawn-helper`, patches `unixTerminal.js`, and packages the DMG. Output: `apps/desktop/release/PhantomOS-{version}-arm64.dmg`.

## Full flow (verify + install + launch)

Paste this wholesale — order matters:

```bash
# 1. Free port 3849 (the bundle binds it; kill any dev server)
lsof -tiTCP:3849 | xargs kill 2>/dev/null

# 2. Build
bun run dist:mac

# 3. Static checks
grep -c "// src/routes/" packages/server/dist/index.cjs   # expect 25
file apps/desktop/release/mac-arm64/PhantomOS.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node
# expect: Mach-O 64-bit bundle arm64

# 4. Live probe — launches the packaged app, GETs every API route
bash scripts/verify-bundle.sh
# expect: "passed: 24   failed: 0"

# 5. Install
pkill -x PhantomOS 2>/dev/null
rm -rf /Applications/PhantomOS.app
hdiutil attach apps/desktop/release/PhantomOS-1.0.0-arm64.dmg -nobrowse -quiet
cp -R "/Volumes/PhantomOS 1.0.0/PhantomOS.app" /Applications/
hdiutil detach "/Volumes/PhantomOS 1.0.0" -quiet

# 6. Clear macOS quarantine (unsigned ad-hoc builds need this)
xattr -cr /Applications/PhantomOS.app
xattr -dr com.apple.provenance /Applications/PhantomOS.app 2>/dev/null || true

# 7. Re-sign spawn-helper (xattrs can re-apply after the copy)
codesign --force --sign - /Applications/PhantomOS.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/build/Release/spawn-helper

# 8. Launch
open /Applications/PhantomOS.app
```

If the DMG version isn't `1.0.0`, update the `hdiutil` paths accordingly. Read `apps/desktop/package.json` for the current version.

## What to do when things break

Before touching source, run the diagnostics below. Only then read BUILD.md's *Known Build Issues*.

### Terminals fail: "posix_spawnp failed"
```bash
grep "helperPath.replace" /Applications/PhantomOS.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/lib/unixTerminal.js
```
- Expect `(?!\.unpacked)` in the regex. If absent, `rebuild-native.cjs`'s idempotency patch didn't run — rebuild.
- Also verify: `codesign -dv .../spawn-helper 2>&1 | grep Signature` → expect `adhoc`.

### All fetches resolve to `file:///api/...`
```bash
grep -rnE "fetch\(\`/api/|fetch\('/api/|fetch\(\"/api/" apps/desktop/src/renderer packages --include='*.ts' --include='*.tsx'
```
- Expect empty output. Any hits = raw fetch missing the `${API_BASE}` prefix. Fix the file, rebuild.
- Also check: `grep __PHANTOM_API_BASE apps/desktop/src/renderer/index.html` — the inline script must run before any module loads.

### Routes 404 / server didn't start
- Launch from terminal to see server logs: `apps/desktop/release/mac-arm64/PhantomOS.app/Contents/MacOS/PhantomOS`
- Look for `[PhantomOS Desktop] API server is ready`. If absent, the server crashed — stderr above shows why.
- Common cause: native module ABI mismatch (`NODE_MODULE_VERSION`). `rebuild-native.cjs` handles this; if it didn't, delete `apps/desktop/release/` and rebuild.

## Dev impact of production fixes

All of the prod-only machinery (spawn-helper codesign, `unixTerminal.js` patch, `child_process.spawn(..., ELECTRON_RUN_AS_NODE='1')`, inline `__PHANTOM_API_BASE`) is guarded by `app.isPackaged` or only runs during electron-builder's `afterPack`. **Dev mode is never affected.** Don't try to "simplify" by removing the prod guards.

## Files this skill touches

- `apps/desktop/scripts/rebuild-native.cjs` — afterPack hook (native rebuild, codesign, unixTerminal.js patch)
- `apps/desktop/src/main/server.ts` — spawns the API server
- `apps/desktop/src/renderer/index.html` — inline `__PHANTOM_API_BASE` script
- `apps/desktop/src/renderer/lib/api.ts` — exports `API_BASE` for renderer fetches
- `scripts/verify-bundle.sh` — live route probe
- `scripts/build-server.mjs` — server bundler
