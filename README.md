# Phantom OS

**A gamified desktop app for Claude Code — track sessions, manage worktrees, and level up your workflow.**

Built by [Subash Karki](https://github.com/karki011)

## Quick Start

```bash
# Prerequisites: Bun 1.3+, Node.js 22+
bun install
bun run dev
```

This starts both the API server (port 3849) and the Electron desktop app.

### Shell Aliases (optional)

```bash
alias pod="cd ~/phantom-os && bun run dev"      # Start everything
alias poa="cd ~/phantom-os && bun run dev:api"   # API server only
alias poc="cd ~/phantom-os"                       # Jump to project
```

## Features

### Session Dashboard
Real-time monitoring of all Claude Code sessions — token usage, costs, tool breakdowns, and activity streams. Watches `~/.claude/sessions/` automatically.

### AI Engine (phantom-ai)
Graph-backed code intelligence that auto-injects into Claude sessions via MCP. Provides blast radius analysis, dependency paths, and related file discovery — so Claude understands your codebase structure before making changes.

### Terminal
Full terminal with `node-pty` and `xterm.js`. Supports split panes, tab management, and 3-tier persistence:
- **Hot restore** — survives worktree switches (xterm stays alive in memory)
- **Warm restore** — PTY daemon persists across WebSocket disconnects
- **Cold restore** — scrollback snapshots restore on app restart

### Worktree Management
Create, switch, and manage git worktrees. Each worktree gets its own pane layout, terminal sessions, and editor state — all persisted to SQLite.

### Split Pane Workspace
Binary tree layout system with drag-and-drop, horizontal/vertical splits, resizable dividers, and per-worktree persistence. Pane types: Terminal, Editor, Chat, Diff, Home.

### Chat with Claude
Built-in chat interface using `claude -p` with conversation history, model selection (Sonnet/Opus/Haiku), streaming responses, and file attachments.

### Code Editor
Monaco editor with syntax highlighting, IntelliSense, and diff viewer. Lazy-loaded with web worker offloading.

### Gamification
Optional RPG layer — XP for sessions and tasks, hunter ranks (E through SSS), daily quests, streaks, and 28+ achievements. Toggle on/off from the header.

### Concise Mode
One-click toggle that injects a system prompt making Claude ~65-75% less verbose while keeping full technical accuracy.

### Themes
4 built-in themes (CZ Dark, Cyberpunk, Nord, Dracula) with a pluggable token system for custom themes.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.3 |
| Desktop | Electron 41 + electron-vite |
| Frontend | React 19 + Mantine v9 + Jotai |
| Backend | Hono (port 3849) |
| Database | SQLite (better-sqlite3 + Drizzle ORM) |
| Terminal | node-pty + xterm.js |
| Editor | Monaco |
| AI Engine | MCP server + code graph |
| Monorepo | Turborepo + Bun workspaces |

