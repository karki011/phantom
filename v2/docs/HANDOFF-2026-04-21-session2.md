# PhantomOS v2 — Session 2 Handoff (2026-04-21)

**Author:** Subash Karki
**Session:** Terminal integration (Waves 1-3), sidebar wiring, home screen

---

## What Was Built This Session

### Terminal Integration (3 Waves)

**Wave 1 — Foundation:**
- `SubscribeTerminal` / `UnsubscribeTerminal` Wails bindings — bridges PTY output to frontend via events
- Auto-subscribe on `CreateTerminal` — frontend gets events immediately
- `ListTerminals` binding
- cwd passthrough: worktree path → pane data → TerminalPane → Go PTY
- WebLinksAddon (clickable URLs) + SearchAddon with Cmd+F inline search bar
- Binary data fix: `atob()` → `Uint8Array` for proper UTF-8/ANSI handling

**Wave 2 — Terminal Management:**
- `RunRecipe(projectId, recipeId)` Go binding — executes project recipes in terminal
- Inline search UI: Cmd+F opens search bar, Enter/Shift+Enter for next/prev, Escape closes
- `runRecipe` frontend binding

**Wave 3 — Bubbletea Integration:**
- Added `charmbracelet/bubbletea`, `bubbles`, `lipgloss` to go.mod
- `internal/tui/` package: runner.go, setup_wizard.go, recipe_runner.go
- `RunBubbleteaProgram` / `WriteBubbleteaProgram` / `ResizeBubbleteaProgram` / `DestroyBubbleteaProgram` Wails bindings
- TUI pane type registered in PaneRegistry (reuses TerminalPane with sessionId routing)
- `addTabWithData` helper for opening panes with pre-populated data

### Sidebar

- Layout fix: sidebar always visible on worktree tab (was hidden behind activeWorktreeId conditional)
- Add Project / Clone Repository / Scan Directory buttons wired to Go backend
- Auto-create default branch workspace on `AddProject` (so sidebar shows something)
- GitBranch icon for local branches, GitFork icon for worktrees
- Folder/FolderOpen icons for project expand state
- Tree hierarchy: indent lines, spacing, bottom padding between projects
- Kobalte Tooltip via reusable `<Tip>` component (shared/Tip/)
- Project context menu: Remove (cascade-deletes workspaces + graph data), New Worktree, Collapse/Expand
- Bootstrap race condition fix: `bootstrapWorktrees` awaits `bootstrapProjects`
- `refreshProjects()` for post-mutation updates (separate from cached bootstrap)
- Active session green dot properly scoped by worktree cwd

### Home Screen

- Default pane type is now `home` (WorktreeHome) instead of terminal
- Quick actions: Terminal (wired), Editor/Chat/Recipe (placeholder with "coming soon")
- Workspace info card: branch name, type (Local/Worktree), code graph status, path
- Plans card (placeholder)
- Per-worktree state cache fix: `previousWorktreeId` tracking instead of reading stale signal

### Shared Components

- `PhantomLoader` — reusable loading screen with onboarding-style glow + scanline animation
- `Tip` — Kobalte Tooltip wrapper with Vanilla Extract styles

### Bug Fixes (from devil's advocate review)

1. **Infinite loop** — `createEffect` tracked workspace store via `switchWorkspace`'s `JSON.stringify`. Fixed with `untrack()`
2. **Global selectedRecipes** — package-level map in setup_wizard.go. Moved to struct field
3. **atob binary corruption** — replaced with Uint8Array decode
4. **setup-wizard vs setup_wizard** — programType mismatch fixed
5. **TUI input routing** — TerminalPane now routes to `writeBubbleteaProgram` for TUI panes
6. **Double subscription leak** — removed WS subscriber from CreateTerminal
7. **TUI shutdown cleanup** — added to app.go Shutdown
8. **Close deadlock** — sync.Once + 3s timeout on tui.Session.Close()
9. **FK cascade on RemoveProject** — deletes workspaces + graph data before project
10. **Home tab uncloseable** — removeTab blocks if label === 'Home'

---

## Current App State

### Working
- Native macOS window via Wails v2
- Sidebar: projects load, expand/collapse, add/remove/scan
- Worktree selection → Home screen with quick actions
- Terminal opens in correct worktree cwd
- Terminal: full height, auto-focus, loading animation, Cmd+F search, ANSI colors
- Per-worktree workspace state caching (switch and switch back preserves state)
- Active session green dots (scoped by cwd)
- Keyboard shortcuts: Cmd+1/2 tabs, Cmd+B sidebar, Cmd+T new tab, Cmd+F terminal search

### Known Issues
- Clone Repository button uses `window.prompt()` which doesn't work in Wails WebView — needs native dialog or Kobalte Dialog
- Plans card label/value still run inline (needs statusCell wrapper)
- `computations created outside createRoot` warnings — module-level createMemo, harmless

### Placeholder / Not Yet Wired
- Right sidebar: Files/Changes/Activity tabs (structure built, needs Go binding wiring)
- Editor/Chat/Recipe quick actions on home screen
- System/Cockpit tab (shows "coming soon")
- Code graph status in workspace info card (shows "Ready" placeholder)
- Plans discovery

---

## What to Build Next

### Priority 1: Kobalte Component Refactor
Replace custom CSS cards/tabs/inputs with proper Kobalte components:
- `Tabs` for pane tab bar (currently custom CSS)
- `Separator` for dividers
- `Badge` for worktree count
- `TextField` for search input, inline worktree input
- `Dialog` for clone repo URL input (replaces broken window.prompt)
- `Accordion` for collapsible project sections
- `Skeleton` for loading placeholders
- `Progress` for loading bars

### Priority 2: Wire Right Sidebar
- FilesView → `ListDirectory` Go binding (need to create)
- ChangesView → `GetRepoStatus` Go binding
- GitActivityPanel → `GetCommitLog` Go binding
- Reactive: re-fetch on activeWorktreeId change

### Priority 3: Wave 4 — Smart View
- Raw terminal toggle (Cmd+\)
- Session terminal alongside structured events
- Terminal search wired to SearchAddon

### Priority 4: Cockpit Dashboard
- Session overview, daily cost chart
- By-project/model/tool breakdowns
- Live feed of Claude session events

---

## Architecture

### New Files Created This Session

```
frontend/src/
  shared/
    PhantomLoader/PhantomLoader.tsx    — reusable loading animation
    PhantomLoader/PhantomLoader.css.ts
    Tip/Tip.tsx                        — Kobalte Tooltip wrapper
    Tip/Tip.css.ts

internal/
  tui/
    runner.go           — generic Bubbletea PTY runner
    setup_wizard.go     — 4-step project setup wizard
    recipe_runner.go    — command runner with progress
```

### Key Architecture Decisions
- Wails events are the sole transport for terminal data (WebSocket subscriber removed)
- TUI programs run in-process via pty pair, not as subprocesses
- Per-worktree state cached in memory Map (previousWorktreeId tracking for correct save/restore)
- PhantomLoader is shared — use it anywhere that needs a loading state

---

## How to Run

```bash
cd ~/phantom-os/v2
wails dev
```

Frontend only:
```bash
cd ~/phantom-os/v2/frontend
pnpm install
pnpm dev
```

Then commit this handoff too with: `git add -A && git commit` with message "docs: add session 2 handoff — terminal waves 1-3, sidebar, home screen"

Author: Subash Karki
