# Phantom OS Performance Optimization Plan
**Date:** 2026-04-15  
**Author:** Subash Karki  
**Goal:** Make worktree switching, terminal interaction, file tree, and all UI transitions feel instant and smooth — like VS Code.

---

## Current State (What We Fixed So Far)

### Terminal Scroll Bug — FIXED ✅
- **Root cause**: xterm.js `scrollToBottom()` updates internal state but not DOM `scrollTop` after container reparenting
- **Fix**: Offscreen container keeps wrappers in DOM + manual DOM scrollTop calculation after scroll restore
- **Files changed**: `packages/terminal/src/state.ts`, `packages/panes/src/core/atoms.ts`, `packages/server/src/routes/terminal-ws.ts`, `packages/terminal/package.json`
- **What's working**: WebGL addon, offscreen container, DOM scrollTop fix, fast-path WS messages, backpressure, workspace switch guard

### Terminal Disposal Race — FIXED ✅
- **Root cause**: StrictMode double-mount + `switchWorkspaceAtom` reloading same workspace
- **Fix**: Guard `if (activeWorkspaceId === workspaceId && !coldBoot) return` + `attaching` guard in disposeSession

---

## Architecture Vision

**The goal**: Switch between worktrees in <100ms with zero flicker, zero scroll reset, and zero data loss. Every view (terminal, files, changes, activity) should show cached data instantly, then refresh in the background.

**The pattern** (from VS Code/Zed research):
- **Model outlives view**: Terminal sessions, file trees, git status survive React unmount/remount
- **Never destroy data on switch**: Cache per-worktree data, show stale-while-revalidate
- **Single SSE connection**: One event bus, components subscribe to what they need
- **Batch updates**: Group multiple atom writes into single React renders

---

## Phase 1 — Quick Wins (1-2 days, highest ROI)

### 1.1 Stop Destroying Worktree Data on Switch
**Impact: 10/10 | Effort: 2/10**

The single biggest win. Currently `clearFileTreeAtom` wipes the entire file tree cache and `prStatusFamily.remove()` deletes activity data on every worktree switch. Both are already keyed by worktreeId — just stop clearing.

**Files:**
- `apps/desktop/src/renderer/atoms/fileExplorer.ts` — remove `clearFileTreeAtom` calls from switch flow
- `apps/desktop/src/renderer/atoms/activity.ts` — stop calling `prStatusFamily.remove()` on switch

**Pattern**: Keep data in atomFamily, index by worktreeId. On switch, just change the active worktreeId — the data for the new worktree loads if not cached, data for the old worktree stays warm.

### 1.2 Consolidate 4 Duplicate SSE Connections
**Impact: 8/10 | Effort: 2/10**

4 separate EventSource connections to the same `/events` endpoint:
- `useSystemEvents.ts` (primary, correct)
- `useGraphStatus.ts` (redundant)
- `WorktreeHome.tsx` (component-level)
- `RunningServersCard.tsx` (component-level)

**Fix**: Single shared SSE connection in `useSystemEvents.ts`. Other components subscribe to specific event types via Jotai atoms that `useSystemEvents` already populates.

**Files:**
- `apps/desktop/src/renderer/hooks/useGraphStatus.ts` — remove EventSource, read from shared atom
- `apps/desktop/src/renderer/components/WorktreeHome.tsx` — remove EventSource
- `apps/desktop/src/renderer/components/sidebar/RunningServersCard.tsx` — remove EventSource

### 1.3 Wrap SSE Atom Updates in `startTransition`
**Impact: 7/10 | Effort: 1/10**

The SSE handler dispatches multiple Jotai atom updates synchronously on every event (`refreshActiveSessions`, `refreshRecentSessions`, `refreshHunter`). This causes cascading re-renders that block the main thread for 50-200ms.

**Fix**: Wrap all SSE-triggered atom updates in `React.startTransition()`:
```ts
import { startTransition } from 'react';

// In SSE handler:
startTransition(() => {
  set(refreshActiveSessions);
  set(refreshRecentSessions);
  set(refreshHunter);
});
```

**File**: `apps/desktop/src/renderer/hooks/useSystemEvents.ts`

### 1.4 Batch SSE Activity Events
**Impact: 7/10 | Effort: 2/10**

The `activity` event handler iterates events and calls `pushFeedEvent` per-event, causing N state updates cascading through 3 derived atoms. Replace with a single batch update.

**File**: `apps/desktop/src/renderer/hooks/useSystemEvents.ts`

### 1.5 Dispose Monaco Models on Workspace Switch
**Impact: 8/10 | Effort: 2/10**

Models are created for up to 500 files but never disposed. Each holds full file content + parsed AST. For a large TypeScript project, this can be 200-500MB.

**Fix**: Track models per workspace root. On switch, dispose models from the previous workspace. Keep an LRU of the 50 most recently opened files.

**File**: `packages/editor/src/LazyMonaco.tsx`

### 1.6 Reduce Terminal Scrollback
**Impact: 6/10 | Effort: 1/10**

10,000 lines per terminal with WebGL buffers = 50-100MB per terminal. Reduce to 5,000 (still generous). Add user preference later.

**File**: `packages/terminal/src/state.ts` — change `scrollback: 10_000` to `5_000`

---

## Phase 2 — Data Layer Upgrade (1 week)

### 2.1 TanStack Query via `jotai-tanstack-query`
**Impact: 7/10 | Effort: 5/10**

Replace all hand-rolled fetch + polling with TanStack Query. For a localhost server with ~0ms latency, stale-while-revalidate is especially powerful — switching worktrees shows cached data instantly, fresh data arrives in the background.

**What it replaces:**
- 4 separate `setInterval` polling calls (RightSidebar, GitActivityPanel)
- Manual loading state management
- Redundant `getWorktrees()` + `getProjects()` calls
- No request deduplication in `fetchApi`

**Package**: `@tanstack/react-query` + `jotai-tanstack-query`

**Key queries to migrate:**
- `getWorktrees()` — `staleTime: 30s`
- `getGitStatus(worktreeId)` — `staleTime: 5s, refetchInterval: 10s`
- `getProjects()` — `staleTime: 60s`
- `getActivity(worktreeId)` — `staleTime: 10s`
- File tree directories — `staleTime: 30s`

### 2.2 Git Status Global Polling + Loading State
**Impact: 6/10 | Effort: 4/10**

Currently fetched independently in 5+ places with no loading state. Add a single polling atom with 10s interval, debounce after git operations.

**Files**: Multiple components (ChangesView, WorktreeItem, BranchSwitcher)

### 2.3 `React.lazy()` for Heavy Views
**Impact: 6/10 | Effort: 2/10**

Cockpit (Recharts), Settings, System debug views are loaded eagerly. Lazy-load them to reduce initial bundle.

**File**: `apps/desktop/src/renderer/App.tsx`

### 2.4 Request Dedup in `fetchApi`
**Impact: 6/10 | Effort: 3/10**

Add in-flight request map + 5-30s TTL cache to `fetchApi`. Prevents duplicate requests when multiple components mount simultaneously.

**File**: `apps/desktop/src/renderer/lib/api.ts`

### 2.5 `useDeferredValue` for File Tree
**Impact: 5/10 | Effort: 2/10**

Defer file tree re-renders while user is typing in search or switching tabs.

**File**: `apps/desktop/src/renderer/components/sidebar/FilesView.tsx`

---

## Phase 3 — Infrastructure (2+ weeks)

### 3.1 MessagePort for Terminal Output
**Impact: 8/10 | Effort: 7/10**

Replace WebSocket+JSON with Electron MessagePort for terminal data. Zero-copy ArrayBuffer transfer. 3-5x throughput improvement.

Currently: `node-pty → terminal-manager → WebSocket JSON → browser → JSON.parse → xterm.write`
Target: `node-pty → main process → MessagePort (Transferable ArrayBuffer) → xterm.write`

### 3.2 Batch Terminal Output (VS Code Pattern)
**Impact: 7/10 | Effort: 3/10**

VS Code batches terminal output at 12ms intervals. Currently we send each PTY output chunk immediately over WebSocket. Accumulate for 10-15ms, send single message.

**File**: `packages/server/src/routes/terminal-ws.ts`

### 3.3 Move Type/Source Scanning to `utilityProcess`
**Impact: 5/10 | Effort: 5/10**

`phantom:read-types` reads up to 100 files synchronously, `phantom:scan-source-files` walks 500 files. Both block the main process. Move to Electron `utilityProcess`.

**File**: `apps/desktop/src/main/ipc-handlers.ts`

### 3.4 File Watching with `fs.watch` Recursive
**Impact: 5/10 | Effort: 4/10**

No file watching currently — file tree is fetched on-demand. Use `fs.watch` with `recursive: true` on macOS (uses FSEvents internally). Debounce and invalidate affected directory cache.

### 3.5 Web Workers for Diff Computation
**Impact: 5/10 | Effort: 5/10**

Move diff computation for Changes view off the main thread. The Vite config already supports workers: `worker: { format: 'es' }`.

---

## Industry Reference

### VS Code Terminal Architecture
- Never destroys xterm.js — wrapper moved between containers
- Hidden terminals stay in DOM with `display: none`
- Zero scroll save/restore — DOM + buffer stay intact
- WebGL addon explicitly disposed before recreation
- Terminal output batched at 12ms

### Zed Terminal Architecture
- Model-view separation — Terminal model persists, view just stops rendering
- Scroll position lives in model, not view
- Zero explicit scroll save/restore

### Common Pattern
The terminal instance must outlive the view/DOM container. Tab/workspace switches should only affect rendering, never destroy the terminal.

---

## Key Files Reference

| File | Role | Optimization Target |
|------|------|-------------------|
| `apps/desktop/src/renderer/lib/api.ts` | API layer (806 lines, no caching) | Request dedup, TanStack Query |
| `apps/desktop/src/renderer/atoms/worktrees.ts` | Worktree state | Stop clearing on switch |
| `apps/desktop/src/renderer/atoms/fileExplorer.ts` | File tree cache (cleared on switch) | Keep warm per-worktreeId |
| `apps/desktop/src/renderer/atoms/activity.ts` | Per-worktree atomFamily | Stop removing on switch |
| `apps/desktop/src/renderer/hooks/useSystemEvents.ts` | Primary SSE (318 lines) | startTransition, batching |
| `apps/desktop/src/renderer/hooks/useGraphStatus.ts` | Duplicate SSE | Remove, use shared |
| `packages/panes/src/core/atoms.ts` | Workspace switching | Already optimized |
| `packages/editor/src/LazyMonaco.tsx` | Monaco models (never disposed) | LRU dispose |
| `packages/terminal/src/state.ts` | Terminal runtime registry | Already optimized ✅ |
| `packages/server/src/routes/terminal-ws.ts` | WebSocket terminal bridge | Already optimized ✅ |
| `apps/desktop/src/renderer/App.tsx` | Root component (15+ useEffects) | React.lazy() |

---

## Success Metrics
- Worktree switch: <100ms perceived (show cached data, refresh in background)
- Terminal reattach: <16ms (single frame, no scroll jump) ✅ DONE
- File tree load: instant from cache on return, <200ms fresh
- SSE event processing: <5ms per event batch (no main thread stalls)
- Memory: <500MB with 5 terminals + editor (currently can hit 1GB+)
