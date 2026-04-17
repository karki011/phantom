# PhantomOS — Agent Instructions

> Cross-tool agent guide. Claude Code-specific extensions live in `CLAUDE.md` and `.claude/`. Read both.

## Tech Stack

- TypeScript monorepo managed with **Bun** + **Turbo**.
- `apps/desktop` — Electron shell (main + preload + renderer).
- `packages/server` — Hono REST API, SSE, WebSocket (PTY).
- `packages/panes`, `packages/terminal`, `packages/editor`, `packages/theme`, `packages/shared`.
- UI: **Mantine** (not Chakra). Icons: `lucide-react`. State: **Jotai** (`atomFamily` for per-worktree isolation).
- DB: `better-sqlite3` at `~/.phantom-os/phantom.db`.
- Terminal: `node-pty` via `utilityProcess`-less child (see below).

## Styling

- Use inline CSS with `--phantom-*` custom properties from `packages/theme/src/tokens/cz-dark.ts`.
- Key tokens: `--phantom-accent-cyan` `#00d4ff`, `--phantom-status-success` `#22c55e`, `--phantom-status-error` `#ef4444`, `--phantom-accent-gold` `#f59e0b`.
- Runtime-injected CSS keyframes (`ceremony-breathe`, `ceremony-progress`, `ceremony-fadein`, ...).
- Implementing from Figma: **ask for exact border-radius, shadows, colors, spacing before coding**. Reference existing components first.

## Patterns to Respect

- All git actions go through `POST /api/worktrees/:id/git` with an `action` field — don't add new git endpoints, extend the action union.
- Background tasks (PR creation, AI commit) respond immediately and broadcast results via SSE. Handle events in `useSystemEvents.ts`.
- Per-worktree state isolation via `atomFamily` (`atoms/activity.ts`, `atoms/aiCommit.ts`).
- Renderer fetches must prefix with `API_BASE` from `apps/desktop/src/renderer/lib/api.ts`. Raw `fetch('/api/...')` breaks the packaged `.app` (resolves to `file:///api/...`).

## Dev vs Prod — Critical

Several production-only code paths exist specifically so dev keeps working. **Don't remove the guards.**

- `apps/desktop/src/main/server.ts` branches on `app.isPackaged`. Dev waits for the turbo dev server on :3849; prod spawns the server via `child_process.spawn(process.execPath, [...], { env: { ELECTRON_RUN_AS_NODE: '1' } })`. Using `utilityProcess.fork` breaks terminals (sandbox blocks posix_spawn).
- `apps/desktop/src/renderer/index.html` sets `window.__PHANTOM_API_BASE` in an inline script *before* modules load. Dev serves via `http://` so this evaluates to `''` (no-op); prod (`file://`) it becomes `http://localhost:3849`.
- `apps/desktop/scripts/rebuild-native.cjs` runs only during electron-builder's `afterPack`. Never invoked in dev.

## Packaging / Distribution

- Build: `bun run dist:mac` → `apps/desktop/release/PhantomOS-{version}-arm64.dmg`.
- Verify every build: `bash scripts/verify-bundle.sh` (expects `passed: 24   failed: 0`).
- Full procedure + diagnostics: `.claude/skills/build-dmg/SKILL.md`.
- Specialist agent: `.claude/agents/dmg-builder.md`.
- Background + architecture: `.claude/BUILD.md`.

## Working Rules

- **Scope discipline.** Make only the changes requested. If you notice unrelated issues, mention them — don't fix them.
- **Layer discipline.** Stay in the layer the user is asking about (renderer vs server vs Electron main). Don't cross layers unless asked.
- **Debugging flow.** Reproduce → trace the exact code path → confirm root cause with the user before writing a fix. Don't stack patches on an unproven hypothesis.
- **Imports.** After edits, verify every import resolves. Don't reference a symbol you haven't ensured is defined/imported.
- **UI changes from Figma.** Ask for exact values first. Don't guess tokens.
- **Destructive ops.** Deleting files/branches, force-push, killing arbitrary processes, `rm -rf /Applications/...`, `hdiutil detach` of mounted volumes — confirm before acting.
- **Error handling.** Only validate at system boundaries (user input, external APIs). Don't wrap internal calls in try/catch "just in case".
- **No speculative abstractions.** Three similar lines is better than a premature abstraction.
- **No unasked comments.** Only comment where the *why* is non-obvious (hidden invariant, workaround, surprising behavior). Never explain *what* — names do that.

## Author

All commits, PRs, and credit → **Subash Karki**.
