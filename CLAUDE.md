## Tech Stack
- TypeScript monorepo: `apps/desktop` (Electron), `packages/server` (Hono), `packages/editor`, `packages/panes`, `packages/theme`
- UI components: Mantine (Text, Tooltip, Menu, Textarea, ScrollArea, ActionIcon, Skeleton, etc.)
- Icons: lucide-react
- State management: Jotai atoms (atomFamily for per-worktree isolation)
- Server: Hono REST API with SSE broadcast for real-time updates
- Git operations: shell exec to git/gh CLI from server routes

## UI Implementation
- Use Mantine components — this project does NOT use Chakra UI
- Style with inline CSS using `--phantom-*` CSS custom properties from the theme (`packages/theme/src/tokens/cz-dark.ts`)
- Key color tokens: `--phantom-accent-cyan` (#00d4ff), `--phantom-status-success` (#22c55e), `--phantom-status-error` (#ef4444), `--phantom-accent-gold` (#f59e0b)
- Animations use CSS keyframes injected at runtime (ceremony-breathe, ceremony-progress, ceremony-fadein, etc.)
- When implementing UI changes from Figma designs, ask clarifying questions about exact values BEFORE implementing. Reference existing component patterns first.

## Patterns
- All git actions go through `POST /api/worktrees/:id/git` with an `action` field
- Background tasks (PR creation, AI commit) respond immediately and broadcast results via SSE
- SSE events handled in `useSystemEvents.ts` hook, updating Jotai atoms
- Per-worktree state isolation via `atomFamily` (see `atoms/activity.ts`, `atoms/aiCommit.ts`)

## Packaging / Distribution
- DMG builds, install, and packaging diagnostics → use the `build-dmg` skill (`.claude/skills/build-dmg/SKILL.md`) or delegate to the `dmg-builder` agent (`.claude/agents/dmg-builder.md`).
- Full background + architecture: `.claude/BUILD.md`.
- One-shot local build: `bun run dist:mac`. Always follow with `bash scripts/verify-bundle.sh` before claiming success.
- **CI/CD release**: `bash apps/desktop/create-release.sh` — interactive version bump, tags `desktop-v*.*.*`, pushes, and monitors GitHub Actions building arm64 + x64 DMGs in parallel.
- **CI iteration**: `bash scripts/retag-and-push.sh` — re-creates the tag at HEAD to re-trigger the workflow without a version bump.
- **Auto-updater**: Installed apps check GitHub Releases via `electron-updater` and auto-download updates.
- **GitHub Pages**: Landing page at `docs/index.html` with smart arch-detection downloads.
- **Dual push remote**: `origin` pushes to both `karki011/Phantom-OS` and `HMK-Solutions/Phantom-OS`.
- `electron-builder.yml` uses `target: default` (per-arch, not universal) with `publish` config pointing to `HMK-Solutions/Phantom-OS`.

## Server Resilience
- DB init is wrapped in try-catch; on failure the server runs in degraded mode (503 for DB-dependent routes).
- `/health` endpoint includes DB status.
- Git identity fallback: onboarding shows editable name/email when git is not configured; commit action falls back to saved preferences.

## Author
- For author or credit: Subash Karki
