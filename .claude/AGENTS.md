# PhantomOS Agent Rules

> Author: Subash Karki

## Project Overview

PhantomOS is a developer desktop app built as an Electron application with an embedded Hono server. It provides a Git-native workflow with real-time updates, an integrated editor, and AI-powered features.

**Stack**: TypeScript monorepo (bun, turbo, electron-vite, electron-builder)

| Layer | Package | Purpose |
|-------|---------|---------|
| Desktop shell | `apps/desktop` | Electron main + renderer |
| API server | `packages/server` | Hono REST API, SSE broadcast, git/gh CLI exec |
| Editor | `packages/editor` | Code editor component |
| Panes | `packages/panes` | Panel/pane system |
| Theme | `packages/theme` | CSS custom properties (`--phantom-*` tokens) |
| DB | `packages/db` | Local database, schema in `src/schema.ts` |
| Shared | `packages/shared` | Cross-package types and utilities |
| Terminal | `packages/terminal` | Terminal emulation |
| UI | `packages/ui` | Shared UI primitives |
| AI Engine | `packages/ai-engine` | Graph-backed adaptive AI agent system |
| Gamification | `packages/gamification` | Achievement/progress system |

## Architecture Rules

### Git operations
All git actions go through `POST /api/worktrees/:id/git` with an `action` field. Never call git directly from the renderer — always route through the server.

### Background tasks
Background tasks (PR creation, AI commit) respond with an immediate acknowledgment and broadcast results via SSE. Do not block the HTTP response waiting for completion.

### Real-time updates
SSE events are handled in `useSystemEvents.ts`, which updates Jotai atoms. Never poll for state changes — subscribe via SSE.

### State isolation
Per-worktree state is isolated via Jotai `atomFamily` (see `atoms/activity.ts`, `atoms/aiCommit.ts`). Always use the worktree ID as the atom family key.

### UI components
Use **Mantine** components (Text, Tooltip, Menu, Textarea, ScrollArea, ActionIcon, Skeleton, etc.). This project does **NOT** use Chakra UI. Do not import from `@chakra-ui/*`.

### Styling
Style with inline CSS using `--phantom-*` CSS custom properties from `packages/theme/src/tokens/cz-dark.ts`. Do not use Tailwind, CSS modules, or styled-components.

### Icons
Use `lucide-react` for all icons. Do not import icon libraries other than lucide.

### Server routes
Server routes live in `packages/server/src/routes/`. Follow the existing Hono route pattern when adding new endpoints.

## Key Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--phantom-accent-cyan` | #00d4ff | Primary accent, links, active states |
| `--phantom-status-success` | #22c55e | Success indicators |
| `--phantom-status-error` | #ef4444 | Error states, destructive actions |
| `--phantom-accent-gold` | #f59e0b | Warnings, highlights |

Animations use CSS keyframes injected at runtime: `ceremony-breathe`, `ceremony-progress`, `ceremony-fadein`, etc.

## Development Rules

1. **Check dependencies first** — Before editing any file, call `mcp__phantom-ai__phantom_graph_context` to understand dependencies and related files.
2. **Check blast radius** — Before refactoring, call `mcp__phantom-ai__phantom_graph_blast_radius` to see what will break.
3. **Stay in your layer** — Do not cross FE/BE boundaries unless explicitly asked. Renderer code and server code are separate concerns.
4. **Verify imports** — After every edit, confirm all imports and references resolve. Never leave dangling imports.
5. **Reuse before creating** — Check existing codebase patterns before introducing new components, utilities, or abstractions.
6. **Minimal changes** — Make only the changes requested. If you spot something else worth fixing, mention it but do not change it.
7. **Reproduce before fixing** — When debugging, reproduce the issue, trace the exact code path, and confirm root cause before writing any fix.

## Build & Distribution

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies |
| `bun run dev` | Start dev (server + desktop) |
| `bun run dev:api` | Start API server only (port 3849) |
| `bun run dev:desktop` | Start desktop app only |
| `bun run dist:mac` | Build DMG for macOS (local, single arch) |
| `bash scripts/verify-bundle.sh` | Verify packaged build (run after every `dist:mac`) |
| `bash apps/desktop/create-release.sh` | Interactive release: version bump, tag, push, monitor CI |
| `bash scripts/retag-and-push.sh` | Re-create tag at HEAD to re-trigger CI (for iteration) |

**Important**: Always run `bash scripts/verify-bundle.sh` after `bun run dist:mac` before claiming success.

### CI/CD Pipeline

- **Trigger**: Pushing a `desktop-v*.*.*` tag fires the GitHub Actions workflow.
- **What it does**: Builds arm64 + x64 DMGs in parallel on macOS runners, codesigns, notarizes, and uploads to GitHub Releases.
- **Required GitHub Secrets**: `MAC_CERTIFICATE`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- **Dual push remote**: `origin` pushes to both `karki011/Phantom-OS` and `HMK-Solutions/Phantom-OS`.
- `electron-builder.yml` uses `target: default` (per-arch, not universal) with `publish` config for `HMK-Solutions/Phantom-OS`.

### Release Process

1. Run `bash apps/desktop/create-release.sh` — it prompts for version bump, creates the tag, pushes, and monitors CI.
2. CI builds both arch DMGs and publishes them to GitHub Releases.
3. The GitHub Pages landing page (`docs/index.html`) auto-detects visitor arch and links to the correct DMG.
4. Existing users receive the update automatically via `electron-updater` (checks GitHub Releases on startup, downloads in background, prompts restart).

### Build Details

- `rebuild-native.cjs` uses `context.arch` from electron-builder (not `process.arch`) for correct cross-compilation.
- All `.node` binaries (`better_sqlite3.node`, `pty.node`) are codesigned in the `afterPack` hook to prevent Gatekeeper quarantine.
- Server DB init is wrapped in try-catch; degraded mode returns 503 on DB failure. `/health` includes DB status.

## Agent Specializations

Available agents in `.claude/agents/`:

| Agent | Scope |
|-------|-------|
| `dmg-builder` | macOS packaging, DMG builds, install verification, prod-only `.app` debugging. Do NOT use for dev-mode issues or UI work. |

Available skills in `.claude/skills/`:

| Skill | Scope |
|-------|-------|
| `build-dmg` | Step-by-step DMG build procedure + diagnostics (`.claude/skills/build-dmg/SKILL.md`) |

For full build architecture and known issues, see `.claude/BUILD.md`.

## Author

All commits and PRs should be credited to **Subash Karki**.
