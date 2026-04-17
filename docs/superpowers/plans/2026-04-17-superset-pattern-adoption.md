# Superset Pattern Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt 5 production-grade patterns from superset-sh/superset to make PhantomOS DMG builds reliable, server restarts instant, git ops non-blocking, and crashes diagnosable.

**Architecture:** Three-phase rollout — Phase 1 (build scripts) ensures native modules ship correctly, Phase 2 (runtime) adds manifest-based server adoption and a git worker thread, Phase 3 (observability) adds structured crash reports with a tabbed log viewer UI.

**Tech Stack:** Node.js scripts (CJS for build, ESM for runtime), Electron utilityProcess, worker_threads, Mantine UI components, Jotai atoms.

**Note:** Do NOT commit to git. Verify after each phase.

---

## File Structure

### Phase 1: Build Reliability
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/desktop/scripts/copy-native-modules.cjs` | Resolve bun symlinks, copy native modules to standard layout |
| Create | `apps/desktop/scripts/validate-native-runtime.cjs` | Post-build validation of `.node` binaries in `.app` bundle |
| Modify | `apps/desktop/package.json` | Add `prebuild` and `postbuild` scripts |

### Phase 2: Process Lifecycle
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/server/src/manifest.ts` | Write/read/remove server manifest file |
| Create | `packages/server/src/git-worker.ts` | Worker thread for git operations |
| Create | `packages/server/src/git-pool.ts` | Worker pool manager with fallback |
| Modify | `apps/desktop/src/main/server.ts` | Manifest adoption logic on startup |
| Modify | `packages/server/src/index.ts` | Write manifest after serve(), remove on SIGTERM |
| Modify | `packages/server/src/routes/worktrees.ts` | Dispatch git exec to worker pool |

### Phase 3: Local Observability
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/desktop/src/main/crash-reporter.ts` | Write structured crash JSON on server exit |
| Modify | `apps/desktop/src/main/server.ts` | Call crash reporter on non-zero exit |
| Modify | `apps/desktop/src/main/ipc-handlers.ts` | Add crash report IPC handlers |
| Modify | `apps/desktop/src/renderer/components/ServerLogModal.tsx` | Tabbed UI: Live Logs + Crash Reports |

---

## Phase 1: Build Reliability

### Task 1: Create copy-native-modules script

**Files:**
- Create: `apps/desktop/scripts/copy-native-modules.cjs`

- [ ] **Step 1: Create the script**

```js
/**
 * copy-native-modules.cjs — Pre-build script
 * Resolves bun symlinks and copies native modules to standard node_modules layout
 * so electron-builder's asarUnpack finds them.
 * @author Subash Karki
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NATIVE_MODULES = ['better-sqlite3', 'node-pty'];
const PROJECT_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(PROJECT_DIR, '..', '..');
const TARGET_NODE_MODULES = path.join(PROJECT_DIR, 'node_modules');

function resolveFromBunStore(name) {
  // Check standard location first
  const standard = path.join(TARGET_NODE_MODULES, name);
  if (fs.existsSync(standard)) {
    const real = fs.realpathSync(standard);
    if (real !== standard) return { symlink: standard, real };
    // Already a real directory — check if it has .node files
    return { symlink: null, real: standard };
  }

  // Check bun store at root
  const bunDir = path.join(ROOT_DIR, 'node_modules', '.bun');
  if (!fs.existsSync(bunDir)) return null;

  const entry = fs.readdirSync(bunDir).find(d => d.startsWith(`${name}@`));
  if (!entry) return null;

  const real = path.join(bunDir, entry, 'node_modules', name);
  if (!fs.existsSync(real)) return null;

  return { symlink: null, real };
}

function hasNodeBinary(dir) {
  try {
    const files = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f);
        if (f.endsWith('.node')) files.push(full);
        else if (fs.statSync(full).isDirectory() && !f.startsWith('.') && f !== 'node_modules') walk(full);
      }
    };
    walk(dir);
    return files;
  } catch {
    return [];
  }
}

function copyModule(name) {
  const resolved = resolveFromBunStore(name);
  if (!resolved) {
    console.error(`[copy-native-modules] FATAL: Cannot find ${name} in node_modules or bun store`);
    process.exit(1);
  }

  const dest = path.join(TARGET_NODE_MODULES, name);

  // If dest is a symlink, remove it and copy the real directory
  if (resolved.symlink) {
    console.log(`[copy-native-modules] ${name}: resolving symlink → ${resolved.real}`);
    fs.rmSync(dest, { recursive: true, force: true });
  } else if (resolved.real === dest) {
    // Already in place — verify it has .node files
    const nodeFiles = hasNodeBinary(dest);
    if (nodeFiles.length > 0) {
      console.log(`[copy-native-modules] ${name}: already in place with ${nodeFiles.length} .node file(s)`);
      return;
    }
    console.log(`[copy-native-modules] ${name}: in place but no .node files, re-copying from bun store`);
    fs.rmSync(dest, { recursive: true, force: true });
  }

  // Copy the real module directory
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  execSync(`cp -R "${resolved.real}/"* "${dest}/"`, { stdio: 'inherit' });

  const nodeFiles = hasNodeBinary(dest);
  console.log(`[copy-native-modules] ${name}: copied to ${dest} (${nodeFiles.length} .node files)`);

  if (nodeFiles.length === 0) {
    console.warn(`[copy-native-modules] WARNING: ${name} has no .node binaries after copy`);
  }
}

console.log('[copy-native-modules] Ensuring native modules are in standard layout for electron-builder...');
fs.mkdirSync(TARGET_NODE_MODULES, { recursive: true });

for (const name of NATIVE_MODULES) {
  copyModule(name);
}

console.log('[copy-native-modules] Done.');
```

- [ ] **Step 2: Run the script to verify it works**

Run: `cd apps/desktop && node scripts/copy-native-modules.cjs`

Expected: Output showing each module resolved and copied (or already in place) with .node file counts.

---

### Task 2: Create validate-native-runtime script

**Files:**
- Create: `apps/desktop/scripts/validate-native-runtime.cjs`

- [ ] **Step 1: Create the validation script**

```js
/**
 * validate-native-runtime.cjs — Post-build validation
 * Checks the built .app bundle to ensure native modules are present,
 * correct architecture, and properly externalized.
 * @author Subash Karki
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NATIVE_MODULES = ['better-sqlite3', 'node-pty'];

function findAppBundle(releaseDir) {
  // Find the .app in the release directory
  const macDir = fs.readdirSync(releaseDir).find(d => d.endsWith('.app'));
  if (!macDir) {
    // Check mac-universal, mac-arm64, mac subdirs
    for (const sub of ['mac-universal', 'mac-arm64', 'mac']) {
      const subDir = path.join(releaseDir, sub);
      if (fs.existsSync(subDir)) {
        const app = fs.readdirSync(subDir).find(d => d.endsWith('.app'));
        if (app) return path.join(subDir, app);
      }
    }
    return null;
  }
  return path.join(releaseDir, macDir);
}

function findNodeFiles(dir) {
  const results = [];
  const walk = (d) => {
    try {
      for (const f of fs.readdirSync(d)) {
        const full = path.join(d, f);
        if (f.endsWith('.node')) results.push(full);
        else if (fs.statSync(full).isDirectory() && !f.startsWith('.')) walk(full);
      }
    } catch {}
  };
  walk(dir);
  return results;
}

function checkArchitecture(nodeFile) {
  try {
    const output = execSync(`file "${nodeFile}"`, { encoding: 'utf-8' });
    const archs = [];
    if (output.includes('arm64')) archs.push('arm64');
    if (output.includes('x86_64')) archs.push('x86_64');
    return archs;
  } catch {
    return [];
  }
}

function main() {
  const projectDir = path.resolve(__dirname, '..');
  const releaseDir = path.join(projectDir, 'release');

  if (!fs.existsSync(releaseDir)) {
    console.error('[validate-native-runtime] No release directory found. Run electron-builder first.');
    process.exit(1);
  }

  const appBundle = findAppBundle(releaseDir);
  if (!appBundle) {
    console.error('[validate-native-runtime] No .app bundle found in release/');
    process.exit(1);
  }

  console.log(`[validate-native-runtime] Validating: ${appBundle}`);

  const resourcesDir = path.join(appBundle, 'Contents', 'Resources');
  const unpackedModules = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules');
  const errors = [];

  // Check 1: Unpacked node_modules exists
  if (!fs.existsSync(unpackedModules)) {
    errors.push('app.asar.unpacked/node_modules/ directory is missing');
  }

  // Check 2-4: Per-module checks
  for (const name of NATIVE_MODULES) {
    const moduleDir = path.join(unpackedModules, name);

    // Existence
    if (!fs.existsSync(moduleDir)) {
      errors.push(`${name}: module directory missing from unpacked asar`);
      continue;
    }
    console.log(`[validate-native-runtime] ✓ ${name}: directory exists`);

    // .node binaries
    const nodeFiles = findNodeFiles(moduleDir);
    if (nodeFiles.length === 0) {
      errors.push(`${name}: no .node binary files found`);
      continue;
    }
    console.log(`[validate-native-runtime] ✓ ${name}: ${nodeFiles.length} .node file(s) found`);

    // Architecture
    for (const nf of nodeFiles) {
      const archs = checkArchitecture(nf);
      if (archs.length === 0) {
        errors.push(`${name}: cannot determine architecture of ${path.basename(nf)}`);
      } else {
        console.log(`[validate-native-runtime] ✓ ${name}: ${path.basename(nf)} → ${archs.join(', ')}`);
      }
    }
  }

  // Check 5: Server bundle has externalized native modules (not bundled inline)
  const serverBundle = path.join(resourcesDir, 'server', 'index.cjs');
  if (fs.existsSync(serverBundle)) {
    const content = fs.readFileSync(serverBundle, 'utf-8');
    for (const name of NATIVE_MODULES) {
      // If the module's source code is bundled, it will contain module-specific internals
      // A properly externalized require just has require("better-sqlite3")
      const requirePattern = `require("${name}")`;
      const requirePatternSingle = `require('${name}')`;
      if (!content.includes(requirePattern) && !content.includes(requirePatternSingle)) {
        errors.push(`${name}: not found as external require in server bundle — may be missing entirely`);
      } else {
        console.log(`[validate-native-runtime] ✓ ${name}: externalized in server bundle`);
      }
    }
  } else {
    errors.push('Server bundle (server/index.cjs) not found in resources');
  }

  // Report
  if (errors.length > 0) {
    console.error('\n[validate-native-runtime] VALIDATION FAILED:');
    for (const err of errors) {
      console.error(`  ✗ ${err}`);
    }
    console.error(`\n${errors.length} error(s) found. Fix these before distributing the DMG.\n`);
    process.exit(1);
  }

  console.log('\n[validate-native-runtime] All checks passed. DMG is safe to distribute.\n');
}

main();
```

- [ ] **Step 2: Verify the script runs (will fail without a build — that's expected)**

Run: `cd apps/desktop && node scripts/validate-native-runtime.cjs`

Expected: Fails with "No release directory found" (correct — no build has been done yet).

---

### Task 3: Wire build scripts into package.json

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Add prebuild and postbuild scripts**

In `apps/desktop/package.json`, update the `scripts` section:

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "start": "electron .",
    "prebuild:dist": "node scripts/copy-native-modules.cjs",
    "dist:mac": "npm run prebuild:dist && electron-builder --mac && node scripts/validate-native-runtime.cjs",
    "dist:dir": "npm run prebuild:dist && electron-builder --dir && node scripts/validate-native-runtime.cjs"
  }
}
```

- [ ] **Step 2: Verify the script chain runs**

Run: `cd apps/desktop && node scripts/copy-native-modules.cjs`

Expected: Native modules copied/verified successfully.

---

### Task 4: Phase 1 Verification

- [ ] **Step 1: Run copy-native-modules and check output**

Run: `cd apps/desktop && node scripts/copy-native-modules.cjs`

Verify: Each module shows resolved path and .node file count > 0.

- [ ] **Step 2: Run validate-native-runtime against a previous build (if available)**

Run: `cd apps/desktop && node scripts/validate-native-runtime.cjs`

If no build exists, verify it exits with the correct "no release directory" message.

- [ ] **Step 3: Verify both scripts together with a dist:dir build**

Run: `cd apps/desktop && bun run dist:dir`

Expected: copy-native-modules runs first, electron-builder packages the app, validate-native-runtime checks the output and passes.

---

## Phase 2: Process Lifecycle

### Task 5: Create server manifest module

**Files:**
- Create: `packages/server/src/manifest.ts`

- [ ] **Step 1: Create the manifest module**

```ts
/**
 * Server manifest — write/read/remove manifest for process adoption.
 * @author Subash Karki
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface ServerManifest {
  pid: number;
  port: number;
  startedAt: string;
  version: string;
}

const MANIFEST_DIR = join(homedir(), '.phantom-os', 'server');
const MANIFEST_PATH = join(MANIFEST_DIR, 'manifest.json');

export const writeManifest = (port: number, version: string): void => {
  mkdirSync(MANIFEST_DIR, { recursive: true });
  const manifest: ServerManifest = {
    pid: process.pid,
    port,
    startedAt: new Date().toISOString(),
    version,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
};

export const readManifest = (): ServerManifest | null => {
  try {
    if (!existsSync(MANIFEST_PATH)) return null;
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch {
    return null;
  }
};

export const removeManifest = (): void => {
  try { rmSync(MANIFEST_PATH, { force: true }); } catch {}
};

export const MANIFEST_PATH_EXPORT = MANIFEST_PATH;
```

---

### Task 6: Add manifest adoption to server.ts

**Files:**
- Modify: `apps/desktop/src/main/server.ts`

- [ ] **Step 1: Add manifest check before spawning**

Add these imports at the top of `apps/desktop/src/main/server.ts`:

```ts
import { readFileSync, rmSync, existsSync } from 'node:fs';
```

Add this function after the `isServerRunning` function (around line 57):

```ts
interface ServerManifest {
  pid: number;
  port: number;
  startedAt: string;
  version: string;
}

const MANIFEST_PATH = join(app.getPath('home'), '.phantom-os', 'server', 'manifest.json');

const tryAdoptServer = async (): Promise<boolean> => {
  try {
    if (!existsSync(MANIFEST_PATH)) return false;
    const manifest: ServerManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));

    // Version mismatch — need fresh server
    const appVersion = app.getVersion();
    if (manifest.version !== appVersion) {
      console.log(`[PhantomOS Desktop] Manifest version mismatch (${manifest.version} vs ${appVersion}), spawning fresh`);
      rmSync(MANIFEST_PATH, { force: true });
      return false;
    }

    // Check if PID is alive
    try {
      process.kill(manifest.pid, 0);
    } catch {
      console.log('[PhantomOS Desktop] Manifest PID is dead, removing stale manifest');
      rmSync(MANIFEST_PATH, { force: true });
      return false;
    }

    // Health check
    const healthy = await isServerRunning(manifest.port);
    if (!healthy) {
      console.log('[PhantomOS Desktop] Manifest server not healthy, removing stale manifest');
      rmSync(MANIFEST_PATH, { force: true });
      return false;
    }

    console.log(`[PhantomOS Desktop] Adopted existing server (PID ${manifest.pid}, port ${manifest.port})`);
    writeLog(`Adopted existing server (PID ${manifest.pid}, port ${manifest.port})`);
    return true;
  } catch {
    return false;
  }
};
```

- [ ] **Step 2: Call tryAdoptServer at the start of the production path in startServer**

In `startServer()`, right after `await app.whenReady();` (line 93) and before the `utilityProcess.fork` call, add:

```ts
  // Try to adopt an already-running server from a previous session
  const adopted = await tryAdoptServer();
  if (adopted) return;
```

- [ ] **Step 3: Update stopServer to remove manifest**

Replace the `stopServer` function:

```ts
export const stopServer = (): void => {
  // Remove manifest so next launch doesn't try to adopt a dead server
  try { rmSync(MANIFEST_PATH, { force: true }); } catch {}
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
};
```

---

### Task 7: Write manifest from server index.ts

**Files:**
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Import and call writeManifest after serve()**

Add import at top of `packages/server/src/index.ts`:

```ts
import { writeManifest, removeManifest } from './manifest.js';
```

- [ ] **Step 2: Write manifest in the serve callback**

In the `serve()` callback (around line 272), after the `logger.banner` call, add:

```ts
  // Write manifest for process adoption on next launch
  try {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    writeManifest(info.port, pkg.default.version ?? '1.0.0');
  } catch {
    writeManifest(info.port, '1.0.0');
  }
```

- [ ] **Step 3: Remove manifest on SIGTERM/SIGINT**

In the `shutdown` function (around line 250), add at the very top before other cleanup:

```ts
  removeManifest();
```

---

### Task 8: Create git worker thread

**Files:**
- Create: `packages/server/src/git-worker.ts`

- [ ] **Step 1: Create the worker**

```ts
/**
 * git-worker.ts — Worker thread for git operations.
 * Receives GitTaskRequest messages, runs git commands, returns results.
 * @author Subash Karki
 */
import { parentPort } from 'node:worker_threads';
import { execFile } from 'node:child_process';

export interface GitTaskRequest {
  id: string;
  op: 'status' | 'diff' | 'log' | 'branch-list' | 'raw';
  repoPath: string;
  args?: string[];
}

export interface GitTaskResult {
  id: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

if (parentPort) {
  parentPort.on('message', (msg: GitTaskRequest) => {
    const gitArgs = buildGitArgs(msg);

    execFile('git', gitArgs, { cwd: msg.repoPath, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const result: GitTaskResult = {
        id: msg.id,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: err ? (err as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0,
      };
      if (err) result.error = err.message;
      parentPort!.postMessage(result);
    });
  });
}

function buildGitArgs(msg: GitTaskRequest): string[] {
  switch (msg.op) {
    case 'status': return ['status', '--porcelain=v1', '-b', '--ahead-behind', ...(msg.args ?? [])];
    case 'diff': return ['diff', ...(msg.args ?? [])];
    case 'log': return ['log', '--oneline', '-20', ...(msg.args ?? [])];
    case 'branch-list': return ['branch', '--list', '-a', ...(msg.args ?? [])];
    case 'raw': return msg.args ?? [];
    default: return msg.args ?? [];
  }
}
```

---

### Task 9: Create git worker pool manager

**Files:**
- Create: `packages/server/src/git-pool.ts`

- [ ] **Step 1: Create the pool manager**

```ts
/**
 * git-pool.ts — Worker pool for git operations with inline fallback.
 * @author Subash Karki
 */
import { Worker } from 'node:worker_threads';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { GitTaskRequest, GitTaskResult } from './git-worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let worker: Worker | null = null;
const pendingTasks = new Map<string, { resolve: (r: GitTaskResult) => void; timer: ReturnType<typeof setTimeout> }>();
let taskCounter = 0;

function createWorker(): Worker | null {
  try {
    const w = new Worker(join(__dirname, 'git-worker.js'));
    w.on('message', (result: GitTaskResult) => {
      const pending = pendingTasks.get(result.id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingTasks.delete(result.id);
        pending.resolve(result);
      }
    });
    w.on('error', () => { worker = null; });
    w.on('exit', () => { worker = null; });
    return w;
  } catch {
    return null;
  }
}

function getWorker(): Worker | null {
  if (!worker) worker = createWorker();
  return worker;
}

function fallbackExec(request: GitTaskRequest): Promise<GitTaskResult> {
  return new Promise((resolve) => {
    const args = request.args ?? [];
    execFile('git', args, { cwd: request.repoPath, timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        id: request.id,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: err ? 1 : 0,
        error: err?.message,
      });
    });
  });
}

export const runGitTask = (op: GitTaskRequest['op'], repoPath: string, args?: string[]): Promise<GitTaskResult> => {
  const id = `git-${++taskCounter}`;
  const request: GitTaskRequest = { id, op, repoPath, args };

  const w = getWorker();
  if (!w) return fallbackExec(request);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingTasks.delete(id);
      fallbackExec(request).then(resolve);
    }, 35_000);

    pendingTasks.set(id, { resolve, timer });
    w.postMessage(request);
  });
};

export const shutdownGitPool = (): void => {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, { timer }] of pendingTasks) clearTimeout(timer);
  pendingTasks.clear();
};
```

---

### Task 10: Phase 2 Verification

- [ ] **Step 1: Verify manifest module compiles**

Run: `npx tsc --noEmit --project packages/server/tsconfig.json`

Expected: No errors.

- [ ] **Step 2: Verify server.ts compiles**

Run: `npx tsc --noEmit --project apps/desktop/tsconfig.json`

Expected: No errors.

- [ ] **Step 3: Start the app in dev mode and check manifest**

Run: `bun run dev` from root

After server starts, check: `cat ~/.phantom-os/server/manifest.json`

Expected: JSON with pid, port 3849, startedAt, version.

- [ ] **Step 4: Restart the app and verify adoption**

Stop and restart. Check logs for "Adopted existing server" message (should appear if the dev server is still running from turbo).

---

## Phase 3: Local Observability

### Task 11: Create crash reporter module

**Files:**
- Create: `apps/desktop/src/main/crash-reporter.ts`

- [ ] **Step 1: Create the crash reporter**

```ts
/**
 * crash-reporter.ts — Writes structured crash reports on server exit.
 * @author Subash Karki
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { release, arch } from 'node:os';

export interface CrashReport {
  timestamp: string;
  exitCode: number;
  electronVersion: string;
  arch: string;
  osVersion: string;
  appVersion: string;
  stderr: string[];
  nativeModules: Record<string, { found: boolean; nodeFiles: string[] }>;
}

const CRASHES_DIR = join(app.getPath('home'), '.phantom-os', 'logs', 'crashes');
const MAX_REPORTS = 10;

const scanNativeModules = (): CrashReport['nativeModules'] => {
  const modules: CrashReport['nativeModules'] = {};
  const NATIVE = ['better-sqlite3', 'node-pty'];

  for (const name of NATIVE) {
    const nodeFiles: string[] = [];
    try {
      const baseDir = join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', name);
      if (existsSync(baseDir)) {
        const walk = (dir: string, prefix: string) => {
          for (const f of readdirSync(dir, { withFileTypes: true })) {
            const rel = prefix ? `${prefix}/${f.name}` : f.name;
            if (f.name.endsWith('.node')) nodeFiles.push(rel);
            else if (f.isDirectory() && !f.name.startsWith('.')) walk(join(dir, f.name), rel);
          }
        };
        walk(baseDir, '');
        modules[name] = { found: true, nodeFiles };
      } else {
        modules[name] = { found: false, nodeFiles: [] };
      }
    } catch {
      modules[name] = { found: false, nodeFiles: [] };
    }
  }
  return modules;
};

export const writeCrashReport = (exitCode: number, stderrLines: string[]): string => {
  mkdirSync(CRASHES_DIR, { recursive: true });

  const report: CrashReport = {
    timestamp: new Date().toISOString(),
    exitCode,
    electronVersion: process.versions.electron ?? 'unknown',
    arch: arch(),
    osVersion: `Darwin ${release()}`,
    appVersion: app.getVersion(),
    stderr: stderrLines.slice(-50),
    nativeModules: scanNativeModules(),
  };

  const filename = `${report.timestamp.replace(/[:.]/g, '-')}.json`;
  const filepath = join(CRASHES_DIR, filename);
  writeFileSync(filepath, JSON.stringify(report, null, 2));

  cleanupOldReports();
  return filepath;
};

const cleanupOldReports = (): void => {
  try {
    const files = readdirSync(CRASHES_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    for (const f of files.slice(MAX_REPORTS)) {
      rmSync(join(CRASHES_DIR, f), { force: true });
    }
  } catch {}
};
```

---

### Task 12: Wire crash reporter into server.ts

**Files:**
- Modify: `apps/desktop/src/main/server.ts`

- [ ] **Step 1: Import crash reporter**

Add to the imports in `server.ts`:

```ts
import { writeCrashReport } from './crash-reporter.js';
```

- [ ] **Step 2: Collect stderr lines and write crash report on exit**

Add a `stderrBuffer` array before `serverProcess` assignment, and modify the exit handler.

After `serverProcess = utilityProcess.fork(...)` (around line 104), add before the stdout/stderr handlers:

```ts
  const stderrBuffer: string[] = [];
```

Update the stderr handler to also push to the buffer:

```ts
  serverProcess.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    process.stderr.write(text);
    writeLog(`[stderr] ${text.trimEnd()}`);
    stderrBuffer.push(text.trimEnd());
  });
```

Update the exit handler to write a crash report:

```ts
  serverProcess.on('exit', (code) => {
    const msg = `Server process exited with code ${code}`;
    console.log(`[PhantomOS Desktop] ${msg}`);
    writeLog(msg);
    if (code !== 0 && code !== null) {
      const reportPath = writeCrashReport(code, stderrBuffer);
      writeLog(`Crash report written to: ${reportPath}`);
    }
    serverProcess = null;
  });
```

---

### Task 13: Add crash report IPC handlers

**Files:**
- Modify: `apps/desktop/src/main/ipc-handlers.ts`

- [ ] **Step 1: Add crash report handlers**

Add after the `phantom:get-server-logs` handler in `ipc-handlers.ts`:

```ts
  /** Read structured crash reports */
  ipcMain.handle('phantom:get-crash-reports', () => {
    try {
      const crashDir = join(app.getPath('home'), '.phantom-os', 'logs', 'crashes');
      if (!existsSync(crashDir)) return [];
      return readdirSync(crashDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 10)
        .map(f => {
          try {
            return JSON.parse(readFileSync(join(crashDir, f), 'utf-8'));
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  });

  /** Clear all crash reports */
  ipcMain.handle('phantom:clear-crash-reports', () => {
    try {
      const crashDir = join(app.getPath('home'), '.phantom-os', 'logs', 'crashes');
      if (!existsSync(crashDir)) return { cleared: 0 };
      const files = readdirSync(crashDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try { require('fs').rmSync(join(crashDir, f)); } catch {}
      }
      return { cleared: files.length };
    } catch {
      return { cleared: 0 };
    }
  });
```

---

### Task 14: Enhance ServerLogModal with tabs and crash reports

**Files:**
- Modify: `apps/desktop/src/renderer/components/ServerLogModal.tsx`

- [ ] **Step 1: Rewrite ServerLogModal with tabbed interface**

Replace the entire file content:

```tsx
/**
 * ServerLogModal — Tabbed log viewer: Live Logs + Crash Reports
 * @author Subash Karki
 */
import { useEffect, useState } from 'react';
import { ActionIcon, Badge, Button, Group, Modal, ScrollArea, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core';
import { Copy, Trash2 } from 'lucide-react';

interface ServerLogModalProps {
  opened: boolean;
  onClose: () => void;
}

type LogLevel = 'error' | 'warning' | 'info';
type Tab = 'logs' | 'crashes';

interface CrashReport {
  timestamp: string;
  exitCode: number;
  electronVersion: string;
  arch: string;
  osVersion: string;
  appVersion: string;
  stderr: string[];
  nativeModules: Record<string, { found: boolean; nodeFiles: string[] }>;
}

const classifyLine = (line: string): LogLevel => {
  const lower = line.toLowerCase();
  if (lower.includes('fatal') || lower.includes('error') || lower.includes('[stderr]')) return 'error';
  if (lower.includes('warn')) return 'warning';
  return 'info';
};

const levelColor: Record<LogLevel, string> = {
  error: 'var(--phantom-status-error, #ef4444)',
  warning: 'var(--phantom-accent-gold, #f59e0b)',
  info: 'var(--phantom-text-secondary, #8b9ab0)',
};

const LogLine = ({ line }: { line: string }) => {
  const level = classifyLine(line);
  return (
    <Text
      size="xs"
      style={{
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        color: levelColor[level],
        lineHeight: 1.6,
      }}
    >
      {line}
    </Text>
  );
};

const CrashReportCard = ({ report }: { report: CrashReport }) => {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
  };

  return (
    <Stack
      gap={8}
      style={{
        padding: 12,
        border: '1px solid var(--phantom-border-subtle, #2a2a3e)',
        borderRadius: 6,
        marginBottom: 8,
      }}
    >
      <Group justify="space-between">
        <Group gap={8}>
          <Badge color="red" size="sm">Exit {report.exitCode}</Badge>
          <Text size="xs" c="dimmed">{new Date(report.timestamp).toLocaleString()}</Text>
        </Group>
        <Tooltip label="Copy to clipboard">
          <ActionIcon variant="subtle" size="sm" onClick={copyToClipboard}>
            <Copy size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Group gap={16}>
        <Text size="xs" c="dimmed">Electron {report.electronVersion}</Text>
        <Text size="xs" c="dimmed">{report.arch}</Text>
        <Text size="xs" c="dimmed">{report.osVersion}</Text>
        <Text size="xs" c="dimmed">v{report.appVersion}</Text>
      </Group>

      <Text size="xs" fw={600} style={{ color: 'var(--phantom-accent-cyan, #00d4ff)' }}>
        Native Modules
      </Text>
      {Object.entries(report.nativeModules).map(([name, info]) => (
        <Group key={name} gap={8}>
          <Badge color={info.found ? 'green' : 'red'} size="xs">{info.found ? 'FOUND' : 'MISSING'}</Badge>
          <Text size="xs" c="dimmed">{name}</Text>
          {info.nodeFiles.length > 0 && (
            <Text size="xs" c="dimmed">({info.nodeFiles.join(', ')})</Text>
          )}
        </Group>
      ))}

      {report.stderr.length > 0 && (
        <>
          <Text size="xs" fw={600} style={{ color: 'var(--phantom-status-error, #ef4444)' }}>
            stderr
          </Text>
          {report.stderr.map((line, i) => <LogLine key={i} line={line} />)}
        </>
      )}
    </Stack>
  );
};

export const ServerLogModal = ({ opened, onClose }: ServerLogModalProps) => {
  const [tab, setTab] = useState<Tab>('logs');
  const [lines, setLines] = useState<string[]>([]);
  const [logPath, setLogPath] = useState('');
  const [crashes, setCrashes] = useState<CrashReport[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setLoading(true);

    const loadLogs = window.phantomOS?.invoke('phantom:get-server-logs', 200)
      .then((result: { lines: string[]; path: string }) => {
        const filtered = result.lines.filter((l) => {
          const lower = l.toLowerCase();
          return lower.includes('error') || lower.includes('warn') || lower.includes('fatal') || lower.includes('fail') || lower.includes('crash');
        });
        setLines(filtered.length > 0 ? filtered : result.lines);
        setLogPath(result.path);
      })
      .catch(() => setLines(['Failed to read logs']));

    const loadCrashes = window.phantomOS?.invoke('phantom:get-crash-reports')
      .then((result: CrashReport[]) => setCrashes(result))
      .catch(() => setCrashes([]));

    Promise.all([loadLogs, loadCrashes]).finally(() => setLoading(false));
  }, [opened]);

  const clearCrashes = () => {
    window.phantomOS?.invoke('phantom:clear-crash-reports').then(() => setCrashes([]));
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Server Diagnostics"
      size="lg"
      styles={{
        header: { background: 'var(--phantom-surface-secondary, #1a1a2e)' },
        body: { background: 'var(--phantom-surface-primary, #0d0d1a)', padding: 0 },
        content: { border: '1px solid var(--phantom-border-subtle, #2a2a3e)' },
      }}
    >
      <Stack gap={0}>
        <Group justify="space-between" style={{ padding: '8px 16px', borderBottom: '1px solid var(--phantom-border-subtle, #2a2a3e)' }}>
          <SegmentedControl
            size="xs"
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            data={[
              { label: 'Live Logs', value: 'logs' },
              { label: `Crash Reports${crashes.length ? ` (${crashes.length})` : ''}`, value: 'crashes' },
            ]}
          />
          {tab === 'crashes' && crashes.length > 0 && (
            <Tooltip label="Clear all crash reports">
              <ActionIcon variant="subtle" size="sm" color="red" onClick={clearCrashes}>
                <Trash2 size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        {tab === 'logs' && (
          <>
            {logPath && (
              <Text size="xs" c="dimmed" style={{ padding: '8px 16px', borderBottom: '1px solid var(--phantom-border-subtle, #2a2a3e)' }}>
                {logPath}
              </Text>
            )}
            <ScrollArea h={400} style={{ padding: '8px 16px' }}>
              {loading && <Text size="sm" c="dimmed">Loading...</Text>}
              {!loading && lines.length === 0 && (
                <Text size="sm" c="dimmed">No logs found. The server may not have started yet.</Text>
              )}
              {lines.map((line, i) => <LogLine key={i} line={line} />)}
            </ScrollArea>
          </>
        )}

        {tab === 'crashes' && (
          <ScrollArea h={400} style={{ padding: '8px 16px' }}>
            {loading && <Text size="sm" c="dimmed">Loading...</Text>}
            {!loading && crashes.length === 0 && (
              <Text size="sm" c="dimmed">No crash reports. The server has not crashed.</Text>
            )}
            {crashes.map((report, i) => <CrashReportCard key={i} report={report} />)}
          </ScrollArea>
        )}
      </Stack>
    </Modal>
  );
};
```

---

### Task 15: Phase 3 Verification

- [ ] **Step 1: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project apps/desktop/tsconfig.json`

Expected: No errors.

- [ ] **Step 2: Start dev mode and verify crash report UI renders**

Run: `bun run dev`

Open app → trigger the log modal → verify two tabs appear (Live Logs / Crash Reports).

- [ ] **Step 3: Test crash report generation**

If possible, simulate a server crash (kill the server PID). Check `~/.phantom-os/logs/crashes/` for a new JSON file. Reopen log modal → switch to Crash Reports tab → verify the crash appears with structured data.

---

## Summary

| Task | Phase | Description |
|------|-------|-------------|
| 1 | 1 | Create copy-native-modules.cjs |
| 2 | 1 | Create validate-native-runtime.cjs |
| 3 | 1 | Wire build scripts into package.json |
| 4 | 1 | Phase 1 verification |
| 5 | 2 | Create manifest module |
| 6 | 2 | Add manifest adoption to server.ts |
| 7 | 2 | Write manifest from server index.ts |
| 8 | 2 | Create git worker thread |
| 9 | 2 | Create git worker pool manager |
| 10 | 2 | Phase 2 verification |
| 11 | 3 | Create crash reporter module |
| 12 | 3 | Wire crash reporter into server.ts |
| 13 | 3 | Add crash report IPC handlers |
| 14 | 3 | Enhance ServerLogModal with tabs |
| 15 | 3 | Phase 3 verification |
