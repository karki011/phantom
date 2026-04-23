# PhantomOS v2 — Session 4 Handoff (2026-04-22/23)

**Author:** Subash Karki
**Session:** Activity panel, git operations, charmbracelet/log, UX polish

---

## What Was Built This Session

### Activity Panel (Right Sidebar)
- **PR Section** — status card (state dot, title, #number, branch info, author, age), "Create PR with Claude" button (AI-generated title+body via `claude --print` + `gh pr create`), hidden on default branch
- **Commits Section** — Branch/All toggle, single-row v1-style format (hash + message + time), fixed height with scroll, clickable rows open GitHub commit URL
- **CI/CD Section** — workflow grouping with expand/collapse, status icons (pass/fail/pending/skipped), adaptive polling (10s pending, 30s settled)
- **Loading skeleton** on initial load, change detection on polls, stale data clearing on worktree switch

### Home Screen — Combined Status + Activity Card
- Single card: workspace status on top, gradient divider, activity section below
- **Default branch**: scrollable list of open PRs targeting branch, each with CI badge (✓/✗/⏳), author, age
- **Feature branch**: PR status card + CI summary, or "Create PR with Claude" button
- Granular loading: git status and PR data load independently (no fullscreen blocker)

### Go Backend — GitHub Integration
- `git/github.go` — `IsGhAvailable`, `GetRemoteURL`, `GetPrStatus`, `GetCiRuns`, `CreatePrWithAI`, `ListOpenPrsForBase`
- `git/github_types.go` — `PrStatus` (with `author`, `created_at`, `checks_passed/failed/pending/total`), `CiRun`
- `app/bindings_github.go` — Wails bindings with `resolveRepoBranch` helper
- `app/bindings_shell.go` — `OpenURL` via Wails `BrowserOpenURL`
- CI status per PR computed from `statusCheckRollup` (no extra API calls)

### charmbracelet/log
- Replaced stdlib `log` across ALL Go binding files (6 files)
- Structured key-value logging: `log.Info("app/FuncName: called", "key", val)`
- Colorized, leveled output in Wails dev terminal

### Switch Branch Dialog
- Branches sorted by `--sort=-committerdate` (most recent first)
- Default branch pinned at top with star icon + accent styling
- Themed list (bgPrimary, accent border, styled scrollbar)

### Bug Fixes
- **Worktree delete** — missing `activeWorktreeId` import in worktrees.ts
- **QuickOpen** — backdrop `alignItems: flex-start` (was stretching to maxHeight)
- **Close Worktree dialog** — refactored to PhantomModal pattern
- **GitCheckoutBranch** — now updates workspace DB `branch` field after checkout
- **isDefaultBranch** — checks branch name, not `workspace.type === 'branch'`
- **gh CLI** — `cmd.Dir` instead of invalid `-C` flag; correct `pr checks` fields
- **Polling** — moved from GitActivityPanel (unmounts on tab switch) to RightSidebar (always mounted)

### UX Polish
- Commit rows: v1-style single row (hash + message + time), hover accent color
- Right sidebar default width 300px
- PR/CI links use Wails `BrowserOpenURL` (works in WebView)
- Commit clicks open GitHub commit URL

---

## Current App State

### Working
- Native macOS window via Wails v2
- Sidebar: projects with star/pin, branch-first sorting, full context menus
- Worktree selection → Home screen with combined status + activity card
- Activity tab: PR status, commits (Branch/All), CI/CD workflow groups
- Switch Branch: sorted by recency, default pinned, themed
- Git operations: fetch, pull, push, switch branch, stage, unstage, commit, discard
- Terminal: full width, auto-focus, Cmd+F search, reactive font
- All modals use PhantomModal theme
- Toast notifications on all operations
- charmbracelet/log across all Go bindings
- QuickOpen (Cmd+P), Settings (Cmd+,), Zoom (Cmd+=/-)

### Known Issues
- Frontend polling in RightSidebar — should move to Go `background.go` with Wails events (SSE pattern)
- `computations created outside createRoot` warnings (harmless)
- HMR doesn't always pick up Vanilla Extract `.css.ts` changes

### Architecture Decisions
- Polling lives in RightSidebar (always mounted), not in tab content
- GitActivityPanel is pure render — no effects, no timers
- CI status per PR comes from `statusCheckRollup` field (embedded in `gh pr list` response)
- `CreatePrWithAI` falls back to commit log if `claude --print` fails

---

## What to Build Next

### Priority 1: Move Polling to Go Backend (SSE Pattern)
- Background goroutine in `background.go` polls GitHub every 60s
- Compares to cached state, only emits Wails events on change
- Frontend listens for `pr:updated`, `ci:updated` events
- Remove all frontend `setInterval`/`setTimeout` for activity data

### Priority 2: Wave 4 — Smart View
- Raw terminal toggle (Cmd+\)
- Session terminal alongside structured events

### Priority 3: Cockpit Dashboard
- Session overview, daily cost chart
- By-project/model/tool breakdowns

### Priority 4: Hunter Screen
- Rank badge, XP progress, achievements

---

## How to Run

```bash
cd ~/phantom-os/v2
wails dev
```

Frontend only:
```bash
cd ~/phantom-os/v2/frontend
pnpm install && pnpm dev
```

Author: Subash Karki
