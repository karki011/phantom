# Activity Panel V2 — PR + Commits + CI/CD

> Rewrite the v2 GitActivityPanel to match v1's 3-section layout with Go backend `gh` CLI bindings, AI-generated PR summaries, and adaptive polling.

---

## Context

- **Repo / Package:** `phantom-os/v2` — Wails (Go) + SolidJS + Vanilla Extract
- **Current state:** GitActivityPanel only shows a flat commit list with manual "Load activity" button
- **Target state:** 3-section panel (PR → Commits → CI/CD) matching v1 feature parity, with background AI PR creation
- **V1 reference:** `apps/desktop/src/renderer/components/sidebar/GitActivityPanel.tsx` (680 lines, React/Mantine)
- **Design:** No Figma — port v1 layout to v2's Vanilla Extract + PhantomOS theme system
- **Constraints:** Must use `gh` CLI (not GitHub API directly), SolidJS reactivity (not React hooks), Kobalte primitives where applicable

---

## Goal

- **What:** Full-featured activity panel with PR status, AI-powered PR creation, branch-scoped commits, and CI/CD run monitoring
- **Why:** Developers need visibility into PR state, CI status, and commit history without leaving PhantomOS
- **Type:** Mixed (Behavioral + API/Data + Visual)
- **Success:** User can see PR status, create PRs with AI summary, toggle branch/all commits, and monitor CI/CD — all from the right sidebar

---

## Scope

### In Scope
- Go bindings for `gh` CLI (PR status, CI runs, PR creation)
- Background AI PR summary generation (Go spawns `claude` → feeds diff → creates PR)
- PR section: status card, "Create PR with Claude" button, creating spinner, hidden on default branch
- Commits section: Branch/All toggle, branch-scoped log via `git log main..HEAD`
- CI/CD section: workflow groups with expand/collapse, status icons, adaptive polling
- Activity tab badge: green dot for open PR, pulse animation for creating
- Loading skeleton on initial load

### Out of Scope
- PR review/merge actions from within PhantomOS
- CI/CD re-run or cancel actions
- Commit diff viewer
- GitHub notifications

---

## Phase Plan

### Phase 1 — Go Backend: gh CLI Bindings · Low risk · ~2hr

New file: `v2/internal/git/github.go`

| Function | What it does | Shell command |
|---|---|---|
| `IsGhAvailable(ctx)` | Check gh is installed + authed | `gh auth status` |
| `GetRemoteURL(ctx, repoPath)` | Get origin URL | `git remote get-url origin` |
| `GetPrStatus(ctx, repoPath, branch)` | PR for current branch | `gh pr view --json number,title,state,url,headRefName,baseRefName,isDraft` |
| `GetCiRuns(ctx, repoPath, branch)` | CI checks for branch | `gh pr checks {branch} --json name,state,status,conclusion,detailsUrl,bucket` |
| `CreatePrWithAI(ctx, repoPath, branch, baseBranch)` | AI summary → `gh pr create` | See below |

New file: `v2/internal/git/github_types.go`

```go
type PrStatus struct {
    Number      int    `json:"number"`
    Title       string `json:"title"`
    State       string `json:"state"`       // OPEN, MERGED, CLOSED
    IsDraft     bool   `json:"is_draft"`
    URL         string `json:"url"`
    HeadRefName string `json:"head_ref_name"`
    BaseRefName string `json:"base_ref_name"`
}

type CiRun struct {
    Name       string `json:"name"`
    Status     string `json:"status"`     // in_progress, completed, queued
    Conclusion string `json:"conclusion"` // success, failure, cancelled, ""
    URL        string `json:"url"`
    Bucket     string `json:"bucket"`     // pass, fail, pending, skipping
}
```

**AI PR Creation flow:**
1. `git diff {baseBranch}...HEAD` → get diff
2. `git log {baseBranch}..HEAD --oneline` → get commit messages
3. Spawn `claude --print -p "Generate a PR title and markdown body..."` with diff+commits as context
4. Parse output → extract title (first line) and body (rest)
5. `gh pr create --title "..." --body "..." --base {baseBranch}`
6. Return the new PR status

**Wails bindings** in `bindings_git_extended.go`:

| Binding | Params | Returns |
|---|---|---|
| `GetPrStatus(worktreeId)` | worktreeId | `*PrStatus` or nil |
| `GetCiRuns(worktreeId)` | worktreeId | `[]CiRun` or nil |
| `CreatePrWithAI(worktreeId)` | worktreeId | `*PrStatus` (async via event) |
| `IsGhAvailable()` | none | `bool` |
| `GetBranchCommits(worktreeId, branchOnly)` | worktreeId, bool | `[]CommitInfo` |

- **Dependencies:** `gh` CLI installed and authenticated
- **CI Impact:** New Go files, `go build` must pass

### Phase 2 — Frontend Signals & Types · Low risk · ~30min

Update `v2/frontend/src/core/types/index.ts`:
- Add `PrStatus` and `CiRun` interfaces

New signals in `v2/frontend/src/core/signals/activity.ts`:
- `prStatus` — per-worktree PR status (signal)
- `ciRuns` — per-worktree CI runs (signal)
- `isCreatingPr` — boolean signal
- `ghAvailable` — boolean signal (checked once on boot)

New bindings in `v2/frontend/src/core/bindings/git.ts`:
- `getPrStatus(worktreeId)` → `PrStatus | null`
- `getCiRuns(worktreeId)` → `CiRun[] | null`
- `createPrWithAI(worktreeId)` → `PrStatus | null`
- `isGhAvailable()` → `boolean`
- `getBranchCommits(worktreeId, branchOnly)` → `CommitInfo[]`

- **Dependencies:** Phase 1 Go bindings
- **CI Impact:** None (types only)

### Phase 3 — PR Section Component · Medium risk · ~1.5hr

New component: `PrSection` inside `GitActivityPanel.tsx`

States:
1. **Default branch** → section hidden entirely
2. **No PR, not creating** → "No pull request" text + "Create PR with Claude" button
3. **Creating** → spinner + "Claude is creating PR..." text
4. **PR exists** → card with state dot, title, PR number, branch info, clickable URL
5. **gh not available** → section hidden (graceful degradation)

Button style: accent background, `GitPullRequest` icon, full-width

PR card: dark card (`bgTertiary`), state dot (green=open, purple=merged, red=closed, muted=draft), title+number row with external link icon, branch info row

- **Dependencies:** Phase 2 signals
- **CI Impact:** None

### Phase 4 — Commits Section Rewrite · Low risk · ~1hr

Rewrite existing `GitActivityPanel` commit list:

- Section header with `GitCommit` icon + "Recent Commits" label
- **Branch/All toggle** in header (right-aligned, uppercase micro text, accent color for active)
- Branch mode: calls `getBranchCommits(wtId, true)` → `git log main..HEAD`
- All mode: calls `getBranchCommits(wtId, false)` → `git log` (existing behavior)
- Commit rows: short hash (mono, accent), message (truncate), relative time
- Clicking a commit opens GitHub URL (if available)
- Empty state: "No commits on this branch yet" (when branch-scoped has 0)

- **Dependencies:** Phase 2 signals
- **CI Impact:** None

### Phase 5 — CI/CD Section · Medium risk · ~1.5hr

New component: `CiSection` inside `GitActivityPanel.tsx`

- Section header with `Play` icon + "CI / CD Runs" + summary count
- **Workflow grouping:** group checks by first segment before " / " separator
- Single-check groups render flat (no expand/collapse)
- Multi-check groups: collapsible with chevron, group status icon (worst-of: fail > pending > pass), check count + summary
- Individual check rows: status icon + name + conclusion label, clickable to open URL
- Status icons: `CheckCircle` (green) for success, `XCircle` (red) for failure, spinner (gold) for in-progress, `Circle` (muted) for queued
- Hidden when `gh` not available or CI data is `null`

- **Dependencies:** Phase 2 signals
- **CI Impact:** None

### Phase 6 — Integration & Polish · Low risk · ~1hr

Wire everything into `GitActivityPanel.tsx`:

- **Layout:** PrSection → divider → CommitsSection → divider → CiSection (scrollable)
- **Loading skeleton:** 3-section skeleton on initial load (matching v1)
- **Polling lifecycle:**
  - PR: fetch on mount + every 60s
  - CI: adaptive — 10s when checks in-progress, 30s when settled
  - Commits: fetch on mount + on `worktree:updated` event
- **Activity tab badge** in RightSidebar: green dot when open PR, pulsing dot when creating PR
- **Event-driven refresh:** listen for `pr:created` event from Go backend to update PR section immediately after AI creation
- **Wails event** from Go: emit `pr:created` when `CreatePrWithAI` completes
- Cleanup: remove old `loadButton` and `activityEmpty` styles, remove manual "Load activity" button

- **Dependencies:** Phases 3-5
- **CI Impact:** CSS changes in `right-sidebar.css.ts`

---

## Risks & Tradeoffs

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `gh` CLI not installed on user's machine | Medium | CI/CD + PR sections hidden | `IsGhAvailable()` check, graceful fallback — commits still work |
| AI PR creation takes >30s | Medium | Medium | Show spinner + "Claude is creating PR..." text, run fully async |
| `gh pr checks` returns empty for repos without CI | Low | Low | Show "No CI runs" empty state |
| `claude` CLI not available for AI summary | Low | Medium | Fallback: create PR without AI summary (plain `gh pr create` with commit log as body) |
| Rate limiting on `gh` CLI | Low | Low | Polling intervals are conservative (10-60s) |

---

## Open Questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| 1 | Should AI PR creation auto-push the branch first if it's not pushed? | Subash | No — assume branch is pushed |
| 2 | Should we show PR review comments in a future phase? | Subash | No — out of scope |

---

## Quality Bar

- All Go bindings have charmbracelet/log structured logging
- Frontend components use Vanilla Extract (no inline styles except simple overrides)
- SolidJS reactive patterns (createEffect, createSignal) — no React patterns
- Graceful degradation when `gh` not available
- Loading skeletons, not blank states
- Adaptive CI polling (fast when pending, slow when settled)
