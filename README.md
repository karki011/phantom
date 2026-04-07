# Phantom OS

**Solo Leveling-themed gamified desktop app for Claude Code sessions.**

An Electron desktop app that turns your Claude Code workflow into an RPG — track sessions, earn XP, level up your Hunter rank, complete daily quests, unlock achievements, and manage terminals + code editors in a split-pane workspace.

Built by [Subash Karki](https://github.com/karki011)

## Features

- **Session Tracking** — Real-time monitoring of all Claude Code sessions with token usage, costs, and tool breakdowns
- **Gamification** — XP system, hunter ranks (E through SSS), daily quests, streaks, and 28+ achievements
- **Terminal Panes** — Embedded terminals backed by a persistent daemon (survives app restarts)
- **Code Editor** — Monaco editor with syntax highlighting, IntelliSense, and web worker offloading
- **Split Pane System** — Binary tree layout with drag-and-drop, split/resize, tabs, and pluggable pane types
- **Live Feed** — Real-time activity stream filtered by category (Code, Terminal, Search, Tasks, Git, Sessions)
- **Token Analytics** — Cost breakdown by project, token usage trends, and session history
- **Pluggable Themes** — 4 built-in themes (CZ Dark, Cyberpunk, Nord, Dracula) + add your own
- **Electron Desktop** — Native macOS app with frameless titlebar

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.3 |
| Desktop | Electron 41 + electron-vite |
| Frontend | React 19 + Chakra UI v3 + Jotai |
| Backend | Hono (child process) |
| Database | SQLite (better-sqlite3 + Drizzle ORM) |
| Terminal | node-pty + persistent daemon (Unix socket, NDJSON protocol) |
| Editor | Monaco (lazy-loaded, web workers for syntax/IntelliSense) |
| Panes | Zustand vanilla store, binary tree layout, drag-and-drop |
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
    panes/                Binary tree pane/tab system (Zustand vanilla core)
      src/core/           Framework-agnostic store, types, layout utils
      src/react/          React components (Workspace, TabBar, LayoutRenderer, ResizeHandle, DropZone)
    server/               Hono API, SSE broadcast, file watchers, collectors
    shared/               Constants, utilities, types
    terminal/             Terminal system
      src/                xterm.js hook (useTerminal), theme
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
                    │  React 19 + Chakra   │
                    │  ┌────┬────┬──────┐  │
                    │  │Term│Edit│Sessns│  │  ← Split pane workspace
                    │  │    │    │      │  │
                    │  └────┴────┴──────┘  │
                    └──────────────────────┘

Terminal Daemon (persistent, survives restarts)
┌──────────────────────────────────────────┐
│  Unix Socket Server                      │
│  ├─ Session 1 → node-pty (zsh)          │
│  ├─ Session 2 → node-pty (bash)         │
│  └─ Session N → node-pty (...)          │
│  64KB scrollback buffer per session      │
│  PID file at ~/.phantom-os/terminal.pid  │
└──────────────────────────────────────────┘
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

The **terminal daemon** runs as a separate persistent process communicating over a Unix socket. Terminals survive app restarts — when Electron relaunches, it adopts the existing daemon via its PID file.

The **pane system** uses a binary tree layout stored in a Zustand vanilla store. You can split any pane horizontally or vertically, drag panes between tabs, resize splits, and the layout persists to localStorage.

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
| `terminal` | Embedded terminal (xterm.js + daemon PTY) |
| `editor` | Monaco code editor (lazy-loaded) |
| `sessions` | Session list with status, tokens, costs |
| `tokens` | Token usage analytics |
| `profile` | Hunter profile (rank, XP, stats) |
| `tasks` | Task tracker |
| `achievements` | Achievement grid |
| `dashboard` | Overview dashboard (planned) |

## Roadmap

- [ ] tRPC-over-IPC (replace HTTP fetch with Electron IPC)
- [ ] Git worktree workspace isolation per task
- [ ] Built-in chat pane (connect to Claude sessions)
- [ ] Monaco diff viewer pane
- [ ] Board-app merge (crew dashboard, Captain's Log)
- [ ] Session crash recovery and cold restore
- [ ] PhantomOS MCP server (expose tools to other agents)
- [ ] `phantom` CLI (Ink/React terminal UI)
- [ ] Packaging and auto-updater (electron-builder)

## License

Private project.
