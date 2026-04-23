# Agent Prompt — Activity Panel V2: PR + Commits + CI/CD

You are a senior engineer working in the PhantomOS v2 codebase (`~/phantom-os/v2`). This is a Wails v2 app with a Go backend and SolidJS + Vanilla Extract frontend. You must follow existing patterns exactly.

---

## Your Task

Rewrite the `GitActivityPanel` in the right sidebar to have 3 sections: **PR Status** (with AI-powered PR creation), **Recent Commits** (with Branch/All toggle), and **CI/CD Runs** (with workflow grouping). The Go backend needs new bindings that shell out to the `gh` CLI for GitHub data and the `claude` CLI for AI PR summaries. The PR section must be hidden on the default branch.

---

## Repo Context

- **Backend:** `v2/internal/git/` (git operations), `v2/internal/app/` (Wails bindings)
- **Frontend:** `v2/frontend/src/components/sidebar/GitActivityPanel.tsx` (current, commit-only)
- **Styles:** `v2/frontend/src/styles/right-sidebar.css.ts` (Vanilla Extract)
- **Types:** `v2/frontend/src/core/types/index.ts`
- **Signals:** `v2/frontend/src/core/signals/` (SolidJS signals)
- **Bindings:** `v2/frontend/src/core/bindings/git.ts` and `index.ts`
- **V1 reference:** `apps/desktop/src/renderer/components/sidebar/GitActivityPanel.tsx` — 680-line React component, use as feature spec only (DO NOT copy React patterns)
- **Theme:** `v2/frontend/src/styles/theme.css.ts` — use `vars.color.*`, `vars.font.*`, `vars.fontSize.*`, `vars.space.*`
- **Logging:** All Go files use `github.com/charmbracelet/log` (structured key-value), NOT stdlib `log`

---

## Implementation Plan

### Phase 1 — Go Backend: gh CLI Bindings

**Create `v2/internal/git/github.go`:**

```go
func IsGhAvailable(ctx context.Context) bool
// Run `gh auth status` — return true if exit code 0

func GetRemoteURL(ctx context.Context, repoPath string) (string, error)
// Run `git remote get-url origin`

func GetPrStatus(ctx context.Context, repoPath, branch string) (*PrStatus, error)
// Run `gh pr view {branch} --repo {repoPath} --json number,title,state,url,headRefName,baseRefName,isDraft`
// Parse JSON into PrStatus struct. Return nil if no PR found (exit code != 0).

func GetCiRuns(ctx context.Context, repoPath, branch string) ([]CiRun, error)
// Run `gh pr checks {branch} --repo {repoPath} --json name,state,status,conclusion,detailsUrl,bucket`
// Parse JSON into []CiRun. Return nil if gh unavailable or no PR.

func CreatePrWithAI(ctx context.Context, repoPath, branch, baseBranch string) (*PrStatus, error)
// 1. Get diff: `git diff {baseBranch}...HEAD` (truncate to ~8000 chars if huge)
// 2. Get commits: `git log {baseBranch}..HEAD --oneline`
// 3. Spawn: `claude --print -p "Given these git changes, generate a PR title on the first line and a markdown PR body below. Be concise.\n\nCommits:\n{commits}\n\nDiff:\n{diff}"`
// 4. Parse output: first line = title, rest = body
// 5. Run: `gh pr create --title "{title}" --body "{body}" --base {baseBranch}`
// 6. Fetch and return the new PR status via GetPrStatus
// Fallback: if claude fails, use commits as body and first commit as title
```

**Create `v2/internal/git/github_types.go`:**
- `PrStatus` struct with json tags (number, title, state, is_draft, url, head_ref_name, base_ref_name)
- `CiRun` struct with json tags (name, status, conclusion, url, bucket)

**Add to `v2/internal/git/log.go`:**
- Modify or add a function that supports branch-scoped logs: `git log {baseBranch}..HEAD` vs `git log`

**Add Wails bindings to `v2/internal/app/bindings_git_extended.go`:**
- `GetPrStatus(worktreeId string) *git.PrStatus` — resolve workspace path, get branch, call `git.GetPrStatus`
- `GetCiRuns(worktreeId string) []git.CiRun` — same pattern
- `CreatePrWithAI(worktreeId string) *git.PrStatus` — resolve path+branch+baseBranch, call `git.CreatePrWithAI`, emit `EventPrCreated`
- `IsGhAvailable() bool` — call `git.IsGhAvailable`
- `GetBranchCommits(worktreeId string, branchOnly bool) []git.CommitInfo` — if branchOnly, use `git log {default}..HEAD`

**Add event to `v2/internal/app/events.go`:**
- `EventPrCreated = "pr:created"`

All functions must use `charmbracelet/log` for entry/error/success logging.

### Phase 2 — Frontend Signals & Types

**Update `v2/frontend/src/core/types/index.ts`:**
```typescript
export interface PrStatus {
  number: number;
  title: string;
  state: string; // OPEN, MERGED, CLOSED
  is_draft: boolean;
  url: string;
  head_ref_name: string;
  base_ref_name: string;
}

export interface CiRun {
  name: string;
  status: string;
  conclusion: string;
  url: string;
  bucket: string;
}
```

**Create `v2/frontend/src/core/signals/activity.ts`:**
```typescript
import { createSignal } from 'solid-js';
import type { PrStatus, CiRun } from '../types';

const [prStatus, setPrStatus] = createSignal<PrStatus | null>(null);
const [ciRuns, setCiRuns] = createSignal<CiRun[] | null>(null);
const [isCreatingPr, setIsCreatingPr] = createSignal(false);
const [ghAvailable, setGhAvailable] = createSignal(false);

export { prStatus, setPrStatus, ciRuns, setCiRuns, isCreatingPr, setIsCreatingPr, ghAvailable, setGhAvailable };
```

**Add bindings to `v2/frontend/src/core/bindings/git.ts`:**
- `getPrStatus(worktreeId)`, `getCiRuns(worktreeId)`, `createPrWithAI(worktreeId)`, `isGhAvailable()`, `getBranchCommits(worktreeId, branchOnly)`
- All follow existing pattern: `try { await App()?.Method(...); } catch { return fallback; }`

**Export from `v2/frontend/src/core/bindings/index.ts`.**

### Phase 3 — PR Section Component

Inside `GitActivityPanel.tsx`, create a `PrSection` component:

- Accept props: `worktreeId: string`, `isDefaultBranch: boolean`
- If `isDefaultBranch` → return null (hidden)
- If `!ghAvailable()` → return null
- If `isCreatingPr()` → show spinner + "Claude is creating PR..." text
- If `prStatus()` exists → show PR card:
  - State dot (colored by state: green=OPEN, purple=MERGED, red=CLOSED, muted=DRAFT)
  - State label (uppercase, muted)
  - Title + #number row (clickable, opens URL)
  - Branch info: `head → base`
- If no PR and not creating → "No pull request" text + "Create PR with Claude" button
- Button calls: `setIsCreatingPr(true)` → `createPrWithAI(worktreeId)` → update signals → `setIsCreatingPr(false)`

### Phase 4 — Commits Section Rewrite

Replace the current commit list with a `CommitsSection` component:

- Section header: GitCommit icon + "Recent Commits" + right-aligned Branch|All toggle
- Toggle is two clickable labels, active one uses `vars.color.accent`
- Branch mode: `getBranchCommits(wtId, true)`
- All mode: `getBranchCommits(wtId, false)`
- Use `createSignal` for `scoped` boolean, `createEffect` to re-fetch on toggle or worktree change
- Commit rows: same layout as v1 (short hash in mono/accent, message truncated, relative time)
- Empty state when branch-scoped has 0 commits: "No commits on this branch yet"

### Phase 5 — CI/CD Section

Create a `CiSection` component:

- If `ciRuns()` is null (gh unavailable) → return null
- Section header: Play icon + "CI / CD Runs" + summary (count + worst status)
- Group runs by workflow prefix (first segment before " / ")
- Single-check groups: flat row with status icon + name + conclusion
- Multi-check groups: collapsible with ChevronRight rotation, group status icon, check count
- Status icons: CheckCircle (success/green), XCircle (failure/red), Loader2+spin (in_progress/gold), Circle (queued/muted)
- All rows clickable → `window.open(url, '_blank')`
- Use Vanilla Extract styles in `right-sidebar.css.ts`

### Phase 6 — Integration & Polish

Rewrite `GitActivityPanel` main component:

- Layout: `PrSection` → divider → `CommitsSection` → divider → `CiSection` (inside scrollable container)
- On mount: check `isGhAvailable()` → set signal
- Polling via `createEffect` + `setInterval`:
  - PR: every 60s
  - CI: adaptive (10s when any run has no conclusion, 30s when all settled)
  - Commits: on mount + on `worktree:updated` Wails event
- Loading skeleton: show on initial fetch (3-section skeleton)
- Listen for `pr:created` Wails event → re-fetch PR status immediately
- Update `RightSidebar.tsx` activity tab badge: green dot when `prStatus()?.state === 'OPEN'`, pulsing dot when `isCreatingPr()`
- Remove old `loadButton`, `activityEmpty` CSS styles and empty state

---

## Constraints & Rules

- Use SolidJS patterns (`createSignal`, `createEffect`, `on`, `Show`, `For`) — NOT React hooks
- Use Vanilla Extract for all styles in `right-sidebar.css.ts` — minimize inline styles
- Use `vars.color.*` from theme contract — no hardcoded colors
- Use `charmbracelet/log` in all Go functions — NOT stdlib `log`
- Reuse existing `runGit` helper in `git/operations.go` for shell commands
- Use lucide-solid icons (already in project): `GitPullRequest`, `GitCommit`, `Play`, `CheckCircle`, `XCircle`, `Circle`, `ChevronRight`, `ExternalLink`, `Loader2`
- `gh` CLI commands must run with `-C {repoPath}` flag or from the repo directory
- Author: Subash Karki in all new files

---

## CI Gates

- [ ] `go build ./internal/app/...` passes
- [ ] `pnpm typecheck:tsc` passes
- [ ] Wails dev starts without errors
- [ ] Activity tab renders without console errors

---

## Definition of Done

- [ ] PR section shows status when PR exists
- [ ] PR section shows "Create PR with Claude" button when no PR (non-default branch)
- [ ] PR section hidden on default branch
- [ ] PR creation runs in background with spinner
- [ ] AI-generated PR title and body appear on GitHub
- [ ] Commits section has working Branch/All toggle
- [ ] Branch-scoped commits show only commits since divergence from base
- [ ] CI/CD section shows workflow groups with correct status icons
- [ ] CI/CD groups expand/collapse
- [ ] Clicking CI check opens GitHub URL
- [ ] Activity tab badge shows green dot for open PR
- [ ] Graceful degradation when `gh` not available (commits still work)
- [ ] Loading skeleton on initial load
- [ ] All Go bindings have structured logging
