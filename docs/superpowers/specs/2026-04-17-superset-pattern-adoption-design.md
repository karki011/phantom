# Superset Pattern Adoption — Build Reliability, Process Lifecycle, Local Observability

**Author:** Subash Karki
**Date:** 2026-04-17
**Status:** Draft
**Approach:** Phased Rollout (3 phases)

## Problem

PhantomOS Desktop's DMG fails on other machines despite working on the developer's machine. Root causes identified:

1. Native modules (`better-sqlite3`, `node-pty`) may not land in the DMG due to bun's symlink-based hoisting
2. No post-build validation — broken builds ship silently
3. Server process cold-boots every app restart (~2-3s splash screen)
4. Heavy git operations block the server main thread
5. Crash info is only available in a local log file with no structure — hard to share or diagnose remotely

Research into [superset-sh/superset](https://github.com/superset-sh/superset) revealed production-grade patterns that solve all five issues.

## Phasing

| Phase | Focus | Outcome |
|-------|-------|---------|
| 1 | Build reliability | Next DMG just works on any Mac |
| 2 | Process lifecycle | Instant restart, non-blocking git |
| 3 | Local observability | Structured crash reports with UI viewer |

---

## Phase 1: Build Reliability

### 1a. copy-native-modules script

**File:** `apps/desktop/scripts/copy-native-modules.ts`
**When:** Runs before electron-builder (`prebuild` step in package.json)

**What it does:**

For each native module (`better-sqlite3`, `node-pty`):

1. Resolve the real path from bun's `.bun/<pkg>@version/node_modules/<pkg>/` layout using `fs.realpathSync`
2. Copy the full module directory (including prebuilds, `.node` binaries, binding.gyp, deps, src) into `apps/desktop/node_modules/<pkg>/` — the standard location electron-builder expects
3. Log what was copied for traceability

**Why:** Bun stores native modules behind symlinks in a content-addressed store. electron-builder's `asarUnpack` follows the standard `node_modules/` layout, so without this step the actual `.node` binaries may not land in the DMG.

**Reference:** Superset's `scripts/copy-native-modules.ts` solves the same bun symlink problem.

### 1b. validate-native-runtime script

**File:** `apps/desktop/scripts/validate-native-runtime.ts`
**When:** Runs after electron-builder completes (post-build step)

**Checks performed inside the built `.app` bundle:**

| Check | What | Fail condition |
|-------|------|----------------|
| Existence | `app.asar.unpacked/node_modules/better-sqlite3/` and `node-pty/` directories exist | Directory missing |
| `.node` binaries | At least one `.node` file in each module's build/Release or prebuilds dir | No `.node` files found |
| Architecture | Run `file <path>.node` and verify it contains expected arch (`arm64`, `x86_64`, or both for universal) | Wrong architecture |
| Externalized | Grep server `index.cjs` for bare `require('better-sqlite3')` — must be externalized, not bundled inline | Native module accidentally bundled |
| Electron ABI | Compare `.node` binary's `NODE_MODULE_VERSION` against the Electron version used | ABI mismatch |

**Behavior:** Fails the build with a clear, actionable error message if any check fails. Exit code 1 prevents the DMG from being produced.

### Phase 1 Verification

1. Run `copy-native-modules` → run electron-builder → run `validate-native-runtime` → confirm all checks pass
2. Deliberately break a native module path → confirm the validator **fails** with a clear message
3. Build a DMG → install on a second Mac → confirm server starts and health check passes

---

## Phase 2: Process Lifecycle

### 2a. Manifest-based server adoption

**Problem:** Every app restart cold-boots the server from scratch.

**Manifest file:** `~/.phantom-os/server/manifest.json`

```json
{
  "pid": 12345,
  "port": 3849,
  "startedAt": "2026-04-17T14:30:00Z",
  "version": "1.0.0"
}
```

**Startup flow change in `apps/desktop/src/main/server.ts`:**

1. Read manifest file (if exists)
2. Check if PID is alive: `process.kill(pid, 0)` (signal 0 = existence check)
3. Health-check the endpoint: `GET http://localhost:{port}/health`
4. If both pass → **adopt**: skip `utilityProcess.fork()`, connect renderer immediately
5. If either fails → remove stale manifest, spawn fresh server as before

**Server-side changes:**

- Server writes manifest on successful startup (after `serve()` binds)
- Server registers `SIGTERM` handler that removes manifest on graceful shutdown
- Manifest includes app version so a version mismatch triggers a fresh spawn (prevents stale server after update)

**Quit behavior:**

- Normal quit (Cmd+Q): kills server, removes manifest
- Crash/force-quit: manifest remains, next launch detects stale PID and cleans up

### 2b. Worker threads for git operations

**Problem:** Git operations (`status`, `diff`, `log`, `branch-list`) run on the Hono server main thread, blocking API responses and SSE events.

**New file:** `packages/server/src/git-worker.ts`

**Message protocol:**

```ts
type GitTaskRequest = {
  id: string;
  op: 'status' | 'diff' | 'log' | 'branch-list';
  repoPath: string;
  args?: string[];
};

type GitTaskResult = {
  id: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};
```

**Design decisions:**

- Uses Node.js `worker_threads` (not child_process) — lighter weight, shared memory potential
- Pool size: 1 worker (git ops are I/O-bound, not CPU-bound — one worker is sufficient)
- Git route handlers dispatch to the worker via `postMessage` instead of calling `execFile` directly
- **Fallback:** if worker dies, recreate it. If creation fails, fall back to inline `execFile` so the app never breaks

### Phase 2 Verification

1. Build and launch → confirm `~/.phantom-os/server/manifest.json` is written with correct PID/port
2. Quit and relaunch → confirm server is adopted (no re-spawn, instant health check pass, no splash delay)
3. Kill server PID manually → relaunch → confirm stale manifest detected, fresh spawn occurs
4. Run git status while SSE stream is active → confirm no blocking / lag on SSE events
5. Kill the git worker thread → confirm fallback to inline `execFile` works

---

## Phase 3: Local Observability

### 3a. Structured crash reports

**Directory:** `~/.phantom-os/logs/crashes/{timestamp}.json`

**Written by:** Main process, when server utility process exits with non-zero code.

**Structure:**

```json
{
  "timestamp": "2026-04-17T14:30:00Z",
  "exitCode": 1,
  "electronVersion": "33.0.0",
  "arch": "arm64",
  "osVersion": "Darwin 24.6.0",
  "appVersion": "1.0.0",
  "stderr": ["[server-preload] FATAL: Cannot find module 'better-sqlite3'", "..."],
  "nativeModules": {
    "better-sqlite3": { "found": true, "nodeFiles": ["build/Release/better_sqlite3.node"] },
    "node-pty": { "found": false, "nodeFiles": [] }
  }
}
```

**Retention:** Keep last 10 crash reports, auto-clean older ones on app startup.

### 3b. Enhanced log viewer UI

Expand the `ServerLogModal` component (already created this session) to include:

- **Two tabs:** "Live Logs" (current `server.log`) and "Crash Reports" (list of crash JSONs)
- **Crash report view:** Structured display showing exit code, OS info, architecture, native module status (found/missing), and stderr output
- **"Copy to Clipboard" button:** Copies the full crash report JSON so users can paste it to the developer

### 3c. IPC handlers

| Handler | Purpose |
|---------|---------|
| `phantom:get-crash-reports` | Read `~/.phantom-os/logs/crashes/`, return sorted list of crash report objects |
| `phantom:clear-crash-reports` | Delete all crash report files (cleanup action from UI) |

### Phase 3 Verification

1. Kill the server process with `kill -9` → confirm crash report JSON created in `crashes/` with correct structure
2. Open log modal → switch to Crash Reports tab → confirm latest crash is displayed with structured info
3. Click "Copy to Clipboard" → paste → confirm valid JSON with full crash context
4. Create 15 dummy crash files → restart app → confirm only 10 remain (auto-cleanup)

---

## Files Changed / Created

### Phase 1 (new)
- `apps/desktop/scripts/copy-native-modules.ts`
- `apps/desktop/scripts/validate-native-runtime.ts`
- `apps/desktop/package.json` (add prebuild/postbuild scripts)

### Phase 2 (new + modified)
- `packages/server/src/git-worker.ts` (new)
- `apps/desktop/src/main/server.ts` (manifest adoption logic)
- `packages/server/src/index.ts` (write manifest on startup)
- Git route handlers in `packages/server/src/routes/` (dispatch to worker)

### Phase 3 (new + modified)
- `apps/desktop/src/main/server.ts` (write crash report on exit)
- `apps/desktop/src/main/ipc-handlers.ts` (crash report IPC handlers)
- `apps/desktop/src/renderer/components/ServerLogModal.tsx` (tabs, crash view, copy button)

## Out of Scope

- Sentry / remote crash reporting — deferred until needed
- Code signing / notarization — separate concern, not part of this spec
- Windows/Linux builds — macOS only for now
- Multiple server instances — single server per app instance
