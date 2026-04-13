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

## Author
- For author or credit: Subash Karki
