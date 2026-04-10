# Phantom OS

**Solo Leveling-themed gamified desktop app for Claude Code sessions.**

An Electron desktop app that turns your Claude Code workflow into an RPG — track sessions, earn XP, level up your Hunter rank, complete daily quests, unlock achievements, and manage terminals + code editors in a split-pane workspace.

Built by [Subash Karki](https://github.com/karki011)

## Features

- **Session Tracking** — Real-time monitoring of all Claude Code sessions with token usage, costs, and tool breakdowns
- **Gamification** — XP system, hunter ranks (E through SSS), daily quests, streaks, and 28+ achievements
- **Terminal Persistence** — Terminals survive worktree switches (hot restore) and app restarts (cold restore with scrollback snapshots)
- **Code Editor** — Monaco editor with syntax highlighting, IntelliSense, and web worker offloading
- **Split Pane System** — Binary tree layout with drag-and-drop, split/resize, tabs, and pluggable pane types
- **Chat with Claude** — Built-in chat via `claude -p`, conversations, history, streaming
- **Worktree Management** — Discover, import, and switch between git worktrees with per-worktree pane state
- **Project Intelligence** — Auto-detect project type, recipe commands, two-column Home layout
- **Live Feed** — Real-time activity stream filtered by category (Code, Terminal, Search, Tasks, Git, Sessions)
- **Token Analytics** — Cost breakdown by project, token usage trends, and session history
- **Pluggable Themes** — 4 built-in themes (CZ Dark, Cyberpunk, Nord, Dracula) + add your own
- **Electron Desktop** — Native macOS app with Shadow Monarch app icon

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.3 |
| Desktop | Electron 41 + electron-vite |
| Frontend | React 19 + Mantine v9 + Jotai |
| Backend | Hono (child process, port 3849) |
| Database | SQLite (better-sqlite3 + Drizzle ORM) |
| Terminal | node-pty + Terminal Runtime Registry (Superset v2 pattern) |
| Editor | Monaco (lazy-loaded, web workers for syntax/IntelliSense) |
| Panes | Jotai atoms, binary tree layout, per-worktree SQLite persistence |
| Monorepo | Turborepo + Bun workspaces |
| Theme | Pluggable token system (ThemeTokens interface) |

## Project Structure

```
phantom-os/
  apps/
    desktop/              Electron desktop app
      src/main/           Main process (server bootstrap, daemon lifecycle, window)
      src/preload/        Context bridge
      src/renderer/       React SPA entry point
  packages/
    db/                   SQLite schema, migrations, client
    editor/               Monaco editor (lazy-loaded, worker config)
    gamification/         XP engine, achievements, daily quests, streaks
    panes/                Binary tree pane/tab system (Jotai atom core)
      src/core/           Framework-agnostic atoms, types, layout utils
      src/react/          React components (Workspace, TabBar, LayoutRenderer, ResizeHandle, DropZone)
    server/               Hono API, SSE broadcast, file watchers, collectors
      src/terminal-history.ts    Cold restore: scrollback persistence to SQLite
      src/routes/terminal-ws.ts  WebSocket relay (detach-on-close, not kill)
      src/routes/terminal-restore.ts  Cold restore REST API
    shared/               Constants, utilities, types
    terminal/             Terminal system
      src/state.ts        Terminal Runtime Registry (keeps xterm + ws alive across mounts)
      src/useTerminal.ts  React hook (attach/detach via registry)
      src/daemon/         Persistent daemon (Unix socket, NDJSON protocol, PTY management)
    theme/                Pluggable theme system + 4 built-in themes
    ui/                   Shared UI components
```

## Architecture

```
                    Electron Main Process
                    ┌─────────────────────┐
                    │  Boot Sequence:      │
                    │  1. Terminal Daemon   │──── ~/.phantom-os/terminal-host.sock
                    │  2. Hono Server      │──── http://localhost:3849
                    │  3. Create Window    │
                    └─────────┬───────────┘
                              │ IPC
                    ┌─────────▼───────────┐
                    │  Electron Renderer   │
                    │  React 19 + Mantine  │
                    │  ┌────┬────┬──────┐  │
                    │  │Term│Edit│Chat  │  │  ← Split pane workspace
                    │  │    │    │      │  │
                    │  └────┴────┴──────┘  │
                    └──────────────────────┘

Terminal Persistence (3-tier)
┌──────────────────────────────────────────────────────┐
│  Tier 1: Hot Restore (worktree switching)            │
│  └─ Terminal Runtime Registry keeps xterm + ws alive │
│     Wrapper div moved between containers             │
│     canvas.refresh() on reattach                     │
│                                                      │
│  Tier 2: Warm Restore (daemon mode)                  │
│  └─ PTY survives in daemon process                   │
│     createOrAttach reattaches with 64KB scrollback   │
│     Unix socket at ~/.phantom-os/terminal-host.sock  │
│                                                      │
│  Tier 3: Cold Restore (app restart)                  │
│  └─ terminal_sessions SQLite table                   │
│     Scrollback snapshots every 10s                   │
│     Respawn PTY in saved cwd + restore banner        │
└──────────────────────────────────────────────────────┘
```

## Getting Started

```bash
# Prerequisites: Bun 1.3+, Node.js 22+
# Install Bun: curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Run the desktop app
bun run dev:desktop

# Or run everything (server + desktop)
bun run dev

# Build for distribution
bun run build
```

### Shell Aliases (optional)

```bash
# Add to ~/.zshrc
alias poc="cd ~/.claude/phantom-os"
alias pod="cd ~/.claude/phantom-os && bun run dev:desktop"
alias pos="cd ~/.claude/phantom-os && bash scripts/start.sh"
alias poa="cd ~/.claude/phantom-os && bun run dev:api"
```

## How It Works

PhantomOS watches `~/.claude/sessions/` and `~/.claude/tasks/` for Claude Code session files. It parses JSONL conversation logs to extract token usage, tool breakdowns, and activity events. All data is stored in a local SQLite database.

**Terminal persistence** works in three tiers:
- **Hot restore** — Terminal Runtime Registry (module-level singleton) keeps xterm.js instances and WebSocket connections alive outside the React tree. On worktree switch, the wrapper div is removed from the DOM but the session continues. On switch-back, the wrapper is re-inserted and `terminal.refresh()` repaints the canvas.
- **Warm restore** — The terminal daemon runs as a separate persistent process. PTY sessions survive WebSocket disconnects via `detach` (not kill). The server calls `createOrAttach` with scrollback replay on reconnection.
- **Cold restore** — The `terminal_sessions` SQLite table persists cwd, shell, env, and scrollback snapshots (every 10s). On app restart, restorable sessions are detected and restored with a "Previous session restored" banner.

The **pane system** uses Jotai atoms with a binary tree layout. You can split any pane horizontally or vertically, drag panes between tabs, resize splits, and the layout persists to SQLite per worktree.

### Gamification

XP is awarded for:
- Starting sessions (+10 XP)
- Completing tasks (+25 XP)
- Speed completions under 2 min (+50 XP)
- Working in new repos (+15 XP)
- Maintaining daily streaks (multiplier)

Ranks progress from E-Rank through S-Rank to National Level Hunter.

## Adding Themes

Create a new file in `packages/theme/src/tokens/`:

```typescript
import type { ThemeTokens } from '../types.js';

export const myThemeTokens: ThemeTokens = {
  name: 'my-theme',
  label: 'My Custom Theme',
  colors: { /* color tuples */ },
  primaryColor: 'teal',
  // ... see packages/theme/src/types.ts for full interface
};
```

Register it in `packages/theme/src/tokens/index.ts`.

## Pane Types

| Type | Description |
|------|-------------|
| `terminal` | Embedded terminal (xterm.js + persistent PTY) |
| `editor` | Monaco code editor (lazy-loaded) |
| `workspace-home` | Hunter's Terminal — project commands, tools, stats |
| `chat` | Chat with Claude (built-in claude -p integration) |
| `sessions` | Session list with status, tokens, costs |
| `tokens` | Token usage analytics |
| `profile` | Hunter profile (rank, XP, stats) |
| `tasks` | Task tracker |
| `achievements` | Achievement grid |

## Roadmap

### Completed
- [x] Terminal session persistence (hot + cold restore)
- [x] Git worktree workspace isolation
- [x] Built-in chat pane (Claude conversations)
- [x] Project Intelligence (auto-detect, recipes)
- [x] Pane persistence (localStorage → SQLite migration)
- [x] State management consolidation (Zustand → Jotai)
- [x] Multi-server dashboard (port allocation, process registry)

### Next Up
- [ ] Re-enable terminal daemon (fix output routing bugs for warm restore)
- [ ] Remove debug logging from terminal registry
- [ ] Playwright E2E tests for terminal persistence
- [ ] Monaco diff viewer pane
- [ ] tRPC-over-IPC (replace HTTP fetch with Electron IPC)
- [ ] Board-app merge (crew dashboard, Captain's Log)
- [ ] PhantomOS MCP server (expose tools to other agents)
- [ ] `phantom` CLI (Ink/React terminal UI)
- [ ] Packaging and auto-updater (electron-builder)
- [ ] Move repo from `~/.claude/phantom-os/` to `~/phantom-os/`

## License

Private project.
