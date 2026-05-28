## Tech Stack

- **Desktop app**: Wails v2.12.0 (Go 1.25 backend + SolidJS frontend via WebKit)
- **Frontend**: SolidJS ^1.9 + TypeScript ^6.0 + Vite ^8.0
- **Styling**: Vanilla Extract (`@vanilla-extract/css`, `recipes`, `sprinkles`) — co-located `.css.ts` files
- **UI primitives**: Kobalte (`@kobalte/core` ^0.13) — headless accessible components (Tabs, Dialog, TextField, Skeleton, etc.)
- **Icons**: `lucide-solid` (NOT lucide-react)
- **State**: SolidJS `createSignal` + `createStore` with `produce` — no Jotai, no atoms
- **Terminal**: xterm.js (`@xterm/xterm` ^6.0) with WebGL renderer + fit/search/serialize addons; optional native Metal terminal via libghostty (build-tagged `ghostty`)
- **Editor**: Shiki ^4.0 syntax highlighting in FileViewer; Milkdown ^7.20 + TipTap ^3.23 for rich text
- **Database**: SQLite via `modernc.org/sqlite` (pure Go, no CGO) + `sqlc` for type-safe queries
- **PTY**: `creack/pty` for terminal sessions
- **Git**: `go-git` v5 + shell exec via `runGit` helper (prepends `-c core.optionalLocks=false`)
- **TUI programs**: Charmbracelet stack (bubbletea, bubbles, lipgloss)
- **MCP server**: `cmd/phantom-mcp/` — bundled into .app, exposes 8 `phantom_*` tools
- **AI/Composer**: Runs `claude` CLI as subprocess, JSONL event streaming, multi-session manager

## Project Structure

```
v2/                     # Main application (Wails v2)
  frontend/src/         # SolidJS frontend
    components/         # Feature-specific UI (sidebar, panes, composer, layout)
    core/               # Signals, bindings, terminal, keyboard, events, types
      bindings/         # Wails binding wrappers (App()?.MethodName())
      signals/          # SolidJS signals (~40 signal modules)
      panes/            # Pane store, types, layout tree
    screens/            # Full-screen views (boot, onboarding, docs, shutdown, system)
    shared/             # Reusable components (~40: PhantomModal, Toast, CommandPalette, etc.)
    styles/             # Vanilla Extract theme, sprinkles, per-feature styles
  internal/             # Go backend
    app/                # Wails App struct + ~46 bindings_*.go files
    ai/                 # AI engine (graph, strategies, evaluator, classifier, orchestrator)
    composer/           # Composer service (claude CLI, sessions, events, auth)
    db/                 # SQLite (WAL mode, 18 migrations, 12 sqlc query files)
    git/                # Git ops (status, branch, worktree, diff, blame, clone, watcher)
    terminal/           # PTY manager, ring buffer, transcript, ghostty/ native terminal
    mcp/                # MCP server (8 phantom_* tools)
    session/            # Session controller (pause/resume/branch/rewind)
    tui/                # Bubbletea TUI programs
    api/                # HTTP API on port 3849 (for Claude Code hooks, edit-gate relay)
    persona/            # Persona system (context-aware routing, voice TTS)
    provider/           # Multi-provider registry (Claude, Codex, Gemini via YAML)
    ...                 # + collector, conflict, journal, linker, stream, ws, etc.
  cmd/phantom-mcp/      # Standalone MCP server binary
  configs/providers/    # Embedded provider YAML configs
web/                    # Next.js 16 landing page (React 19 + Three.js + Tailwind v4)
docs/                   # GitHub Pages landing, release setup, icons
scripts/                # Legacy Electron-era scripts (mostly obsolete)
hooks/                  # Claude Code hooks (phantom-context.js)
.claude/                # Claude Code config, agents, rules, skills, state
```

## Frontend ↔ Backend Communication

- **Wails bindings**: Go methods on `*App` → auto-exposed to JS as `window.go.app.App.MethodName()`
- **Frontend wrappers**: `core/bindings/_app.ts` exports `App()` accessor; each `core/bindings/*.ts` wraps specific methods
- **Events**: Go emits via `wailsRuntime.EventsEmit(ctx, name, data)` → frontend listens via `window.runtime.EventsOn(name, handler)`
- **WebSocket hub**: `internal/ws/` for real-time event broadcasting

## Pane System

- **Types**: `'terminal' | 'native-terminal' | 'tui' | 'editor' | 'composer' | 'home' | 'notes' | 'port-killer'`
- **Registry**: `components/panes/PaneRegistry.ts` — lazy-loaded SolidJS components
- **Layout**: Binary tree of `PaneLeaf | SplitNode` in `core/panes/signals.ts`
- **State**: Per-worktree workspace state cached in `stateCache` Map, persisted via `App().SaveWorkspaceState()`
- **To add a pane**: (1) add type to `PaneType` union in `types.ts`, (2) add to `VALID_PANE_TYPES` in `signals.ts`, (3) register in `PaneRegistry.ts`, (4) add label in `PaneContainer.tsx`

## Command Palette

- Toggle: Cmd+K
- Actions defined in `shared/CommandPalette/actions.ts`
- Categories: Terminal, Navigation, Git, Session, Worktree, Theme, Zoom, System
- Dynamic providers: themes, worktrees, zoom levels
- Fuzzy matching in `shared/CommandPalette/fuzzy.ts`

## UI Implementation

- Use Kobalte primitives — this project does NOT use Mantine or Chakra UI
- Style with Vanilla Extract `.css.ts` files using `vars` from `styles/theme.css.ts`
- Key tokens: `vars.color.*` (bgPrimary, accent, danger, success, border, textPrimary/Secondary/Disabled), `vars.font.*` (body, mono, display), `vars.space.*`, `vars.radius.*`
- Use `buttonRecipe` from `styles/recipes.css.ts` for buttons
- Use `PhantomModal` for all dialogs, `showToast()` for notifications
- Use `lucide-solid` icons (NOT lucide-react)
- When implementing UI changes from Figma designs, ask clarifying questions about exact values BEFORE implementing. Reference existing component patterns first.

## Build / Dev / Release

- **Dev**: `cd v2 && make dev` (or `~/go/bin/wails dev`)
- **Frontend only**: `cd v2/frontend && pnpm dev` (Vite on port 3000)
- **Typecheck**: `cd v2/frontend && pnpm typecheck`
- **Build**: `cd v2 && make build`
- **Release (signed + notarized DMG)**: `cd v2 && make release`
- **Release (zip)**: `cd v2 && make release-zip`
- **sqlc regenerate**: `cd v2 && make sqlc`
- Signing identity: `Developer ID Application: Subash Karki (Z825V2BBX9)`
- Notarization creds: `../.env.notarize` (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID)
- DMG skill: `.claude/skills/build-dmg/SKILL.md` or `dmg-builder` agent
- Full build docs: `.claude/BUILD.md`

## Data Paths

- `~/.phantom-os/phantom.db` — SQLite database
- `~/.phantom-os/sessions-v2/` — Session data
- `~/.phantom-os/worktrees/` — Git worktree checkouts
- `~/Library/Application Support/PhantomOS/` — macOS app support
- `~/Library/Caches/com.wails.PhantomOS/` — WebKit cache
- `~/Library/Preferences/com.wails.PhantomOS.plist` — Preferences

## Environment Variables

- `PHANTOM_LOG_LEVEL` — debug|info|warn|error
- `PHANTOM_NATIVE_TERMINAL` — 0/false to disable libghostty
- `PHANTOM_GATE_DISABLE` — disables edit gate hook
- `PHANTOM_API_PORT` — API server port (default 3849)

## Patterns

- File header: `// Author: Subash Karki` on every `.go`/`.ts`/`.tsx` source file
- Git operations go through Wails bindings (not REST API)
- Per-worktree state isolation via SolidJS stores + `stateCache` Map
- File watcher: `internal/git/watcher.go` uses fsnotify, 5s debounce, skips `.lock`/`~`/`.#`
- All `git` calls go through `runGit` in `internal/git/operations.go` (prepends `-c core.optionalLocks=false`)
- Brand mark: `shared/PhantomMark/PhantomMark.tsx` — use `<PhantomMark size={X} />` for logo
- App constants: `APP_NAME = 'Phantom'` from `core/branding.ts`

## Author

- For author or credit: Subash Karki
