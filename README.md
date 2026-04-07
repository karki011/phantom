# Phantom OS

**Solo Leveling-themed gamified dashboard for Claude Code sessions.**

A desktop app that turns your Claude Code workflow into an RPG — track sessions, earn XP, level up your Hunter rank, complete daily quests, and unlock achievements.

Built by [Subash Karki](https://github.com/karki011)

## Features

- **Session Tracking** — Real-time monitoring of all Claude Code sessions with token usage, costs, and tool breakdowns
- **Gamification** — XP system, hunter levels (E through SSS rank), daily quests, streaks, and achievements
- **Live Feed** — Real-time activity stream filtered by category (Code, Terminal, Search, Tasks, Git, Sessions)
- **Token Analytics** — Cost breakdown by project, token usage trends, and session history
- **Pluggable Themes** — Swappable theme system with CloudZero design tokens (add your own themes)
- **Electron Desktop App** — Native macOS app with frameless titlebar
- **Web Mode** — Also runs as a standard browser app

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 41 + electron-vite |
| Frontend | React 19 + Mantine v8 + Jotai |
| Backend | Hono (Node.js child process) |
| Database | SQLite (better-sqlite3 + Drizzle ORM) |
| Monorepo | Turborepo + pnpm workspaces |
| Theme | Pluggable token system (ThemeTokens interface) |

## Project Structure

```
phantom-os/
  apps/
    desktop/          Electron desktop app
    web/              Browser SPA
  packages/
    db/               SQLite schema, migrations, client
    server/           Hono API, SSE, file watchers, collectors
    theme/            Pluggable theme system + CZ design tokens
    gamification/     XP engine, achievements, daily quests
    shared/           Constants, utilities
    ui/               Shared components (placeholder)
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Run as Electron desktop app
cd apps/desktop && pnpm exec electron-vite dev

# Run as web app (browser)
pnpm dev:api    # Start API server
pnpm dev:web    # Start Vite dev server
# Open http://localhost:3850

# Build
pnpm build
```

### Shell Aliases (optional)

Add to your `.zshrc`:
```bash
alias poc="cd ~/.claude/phantom-os"
alias pod="cd ~/.claude/phantom-os/apps/desktop && pnpm exec electron-vite dev"
alias pos="cd ~/.claude/phantom-os && bash scripts/start.sh"
alias pow="cd ~/.claude/phantom-os/apps/web && pnpm run dev"
alias poa="cd ~/.claude/phantom-os && pnpm dev:api"
```

## How It Works

Phantom OS watches `~/.claude/sessions/` and `~/.claude/tasks/` for Claude Code session files. It parses JSONL conversation logs to extract token usage, tool breakdowns, and activity events. All data is stored in a local SQLite database.

The gamification layer awards XP for:
- Starting sessions
- Completing tasks
- Speed completions (under 2 min)
- Working in new repos
- Maintaining daily streaks

## Adding Themes

Create a new file in `packages/theme/src/tokens/`:

```typescript
import type { ThemeTokens } from '../types.js';

export const myThemeTokens: ThemeTokens = {
  name: 'my-theme',
  label: 'My Custom Theme',
  colors: { /* Mantine color tuples */ },
  primaryColor: 'teal',
  // ... see packages/theme/src/types.ts for full interface
};
```

Then add it to the registry in `packages/theme/src/tokens/index.ts`.

## License

Private project.
