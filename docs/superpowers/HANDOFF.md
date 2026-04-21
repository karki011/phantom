# PhantomOS v2 — Session Handoff

**Updated:** 2026-04-21
**Author:** Subash Karki

---

## Session Log

### Session 1 (2026-04-20): Chrome Shell + Onboarding
- Built 7-phase cinematic onboarding flow (BootTerminal → IdentityBind → DomainSelect → DomainLink → AbilityAwaken → WardConfig → Awakening)
- Settings screen with Kobalte Tabs sidebar layout
- Audio engine, sprinkles, shared components (GlassPanel, HexProgress)
- CRT power-on sweep transition

### Session 2 (2026-04-21): Worktree Workspace — Full Implementation
- Replaced Chrome Shell (StatusStrip/Dock) with proper app shell (SystemHeader + TopTabBar + StatusBar)
- Built entire Worktree Workspace screen in 7 waves (48 new files)
- Ported v1 themes to v2 (12 total themes)
- Installed Go + Wails, verified native app runs

---

## Current App State

### What Works
- **Native macOS window** via Wails v2 — `wails dev` launches the app
- **System / Worktree tabs** — click or Cmd+1 / Cmd+2
- **WelcomePage** — shows when no worktree is selected (Add Project / Clone / Scan buttons)
- **System tab** — "Cockpit coming soon" placeholder
- **Keyboard shortcuts** — Cmd+B (toggle sidebar), Cmd+T (new tab), Cmd+\\ (split pane), Cmd+K (palette placeholder)
- **Go backend** — SQLite DB, 5 collectors running, detects active Claude sessions
- **Status bar** — backend connection dot, session count
- **12 themes** — shadow-monarch, hunter-rank, system-core, cz, cyberpunk, dracula, nord (dark+light variants)

### What's Placeholder (structure built, needs data wiring)
- **Left sidebar** — project/worktree tree renders but empty (needs `bootstrapWorktrees` to populate from Go)
- **Pane system** — binary tree layout works, needs worktree selection to trigger
- **Terminal pane** — xterm.js + registry built, needs active worktree to spawn PTY
- **Right sidebar** — Files/Changes/Activity tabs built, needs git bindings
- **WorktreeHome** — hunter rank, status grid, quick actions (all placeholder data)
- **Cockpit dashboard** — not started

---

## Architecture

### Frontend (88 TypeScript files in v2/frontend/src/)

```
src/
  core/
    signals/       — app, sessions, projects, worktrees, preferences, theme, files (7 files)
    panes/         — types, layout-utils, signals (3 files — binary tree layout engine)
    terminal/      — registry (singleton), signals, index (3 files)
    bindings/      — sessions, projects, git, terminal, preferences, health, ready (8 files)
    events/        — Wails event bridge with auto-cleanup
    keyboard.ts    — global shortcuts
    theme-bridge.ts — vanilla-extract → xterm.js theme resolver
  components/
    layout/        — SystemHeader, TopTabBar, StatusBar (3 files)
    sidebar/       — WorktreeSidebar, ProjectSection, WorktreeItem, InlineWorktreeInput,
                     ResizeHandle, RightSidebar, RightResizeHandle, FilesView,
                     ChangesView, GitActivityPanel, index (11 files)
    panes/         — Workspace, TabBar, LayoutRenderer, PaneContainer, PaneResizeHandle,
                     PaneRegistry, TerminalPane, WorktreeHome (8 files)
    WelcomePage.tsx
  screens/
    onboarding/    — 7-phase cinematic flow (from session 1)
  styles/          — theme.css.ts (12 themes), app-shell, sidebar, panes,
                     right-sidebar, terminal, home, recipes, sprinkles (10 files)
```

### Go Backend (80+ files in v2/internal/)
- `git/` — worktree CRUD, branch, status, diff, log, blame, stash, clone, pool
- `terminal/` — creack/pty manager, session, ring buffer, cold restore
- `db/` — SQLite (pure Go, WAL), sqlc queries
- `collector/` — session/task/todo watchers, JSONL scanner, activity poller
- `stream/` — JSONL event parser, live tailing
- `safety/` — YAML ward rules, PII detection, audit
- `session/` — pause/resume/branch/rewind controller
- `ws/` — WebSocket hub (terminal data, port 9741)
- `app/` — 12 Wails binding files

### Key Patterns
| Pattern | Implementation |
|---------|---------------|
| State management | SolidJS createSignal + createStore with produce |
| Pane system | Binary tree (PaneLeaf/SplitNode), per-worktree state cache |
| Terminal persistence | Module-level singleton registry, attach/detach across unmounts |
| Communication | Wails bindings (request/response) + Wails events (push) |
| Styling | Vanilla Extract compile-time CSS with theme contract (50 tokens) |
| Wails readiness | waitForWails() gate prevents binding race conditions |

---

## What to Build Next

### Priority 1: Wire UI to real data (make it alive)
1. **Project/worktree loading** — wire `bootstrapWorktrees()` to actually call Go `ListProjects`/`listWorktrees` on mount
2. **Worktree selection** — click worktree → set `activeWorktreeId` → pane system activates → terminal spawns
3. **Terminal PTY** — wire output events (`terminal:{id}:data`) to xterm.js
4. **Right sidebar git** — wire `FilesView` to file listing, `ChangesView` to `GetGitStatus`

### Priority 2: Cockpit Dashboard
Build the System tab — session analytics, daily cost chart, by-project/model breakdowns, live feed.

### Priority 3: Follow phase specs
Fully written specs at `~/phantom-os/docs/superpowers/specs/`:
| Phase | Scope | Est. Effort |
|-------|-------|-------------|
| 2 | Git operations (parallel, graph, conflict, rebase, blame) | 2-3 weeks |
| 4 | AI Engine port (graph, strategies, orchestrator) | 4.5-6 weeks |
| 5 | Safety Rules Engine (YAML, PII, audit) | 2.5-3 weeks |
| 7 | Remaining features (gamification, chat, MCP, recipes) | 6-8 weeks |
| 8 | Monaco Editor (multi-tab, blame, LSP, diff) | 6 weeks |
| — | Terminal Integration (Bubbletea TUI programs) | TBD |

---

## Commands

```bash
# Run native app
cd ~/phantom-os/v2
export PATH="$HOME/go/bin:$PATH"
wails dev

# Frontend only (no Go backend)
cd ~/phantom-os/v2/frontend
pnpm dev  # http://localhost:3000

# Go tests
cd ~/phantom-os/v2
go test -race -count=1 -timeout=120s ./...

# Frontend typecheck
cd ~/phantom-os/v2/frontend
pnpm typecheck

# Reset onboarding (to re-test)
sqlite3 ~/.phantom-os/phantom.db "DELETE FROM user_preferences WHERE key = 'onboarding_completed';"

# Kill leftover processes
kill $(lsof -ti:3000) $(lsof -ti:9741) $(lsof -ti:34115) 2>/dev/null
```

---

## Resume Instructions

1. Read this handoff + the plan at `~/.claude/plans/users-subash-karki-phantom-os-users-suba-peaceful-babbage.md`
2. Start with **Priority 1** (wire sidebar to real data — makes the app feel alive)
3. Use `model: "sonnet"` for implementation agents, `model: "opus"` for research only
4. Spawn agents with `bypassPermissions` mode, `run_in_background: true`
5. All frontend code in `~/phantom-os/v2/frontend/src/`, Go backend in `~/phantom-os/v2/internal/`
6. 12 themes available — default is shadow-monarch-dark
