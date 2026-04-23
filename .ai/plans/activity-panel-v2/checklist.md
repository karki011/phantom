# Checklist — Activity Panel V2

Branch: `feat/activity-panel-v2`
Plan: `.ai/plans/activity-panel-v2/plan.md`

---

## Implementation

### Phase 1 — Go Backend: gh CLI Bindings
- [ ] `git/github.go` — `IsGhAvailable`, `GetRemoteURL`, `GetPrStatus`, `GetCiRuns`
- [ ] `git/github.go` — `CreatePrWithAI` (diff → claude → gh pr create)
- [ ] `git/github_types.go` — `PrStatus`, `CiRun` structs
- [ ] `git/log.go` — `LogBranchScoped` (git log main..HEAD)
- [ ] `app/bindings_git_extended.go` — Wails bindings: `GetPrStatus`, `GetCiRuns`, `CreatePrWithAI`, `IsGhAvailable`, `GetBranchCommits`
- [ ] `app/events.go` — Add `EventPrCreated` constant
- [ ] All bindings have charmbracelet/log logging
- [ ] `go build ./internal/app/...` passes

### Phase 2 — Frontend Signals & Types
- [ ] `core/types/index.ts` — `PrStatus`, `CiRun` interfaces
- [ ] `core/signals/activity.ts` — `prStatus`, `ciRuns`, `isCreatingPr`, `ghAvailable` signals
- [ ] `core/bindings/git.ts` — `getPrStatus`, `getCiRuns`, `createPrWithAI`, `isGhAvailable`, `getBranchCommits`
- [ ] `core/bindings/index.ts` — export new bindings

### Phase 3 — PR Section
- [ ] `PrSection` component with 5 states (default branch, no PR, creating, PR exists, gh unavailable)
- [ ] "Create PR with Claude" button (accent, full-width, GitPullRequest icon)
- [ ] PR card (state dot, title, number, branch info, external link)
- [ ] Creating spinner state
- [ ] Hidden on default branch

### Phase 4 — Commits Section Rewrite
- [ ] Section header with Branch/All toggle
- [ ] Branch-scoped commits (git log main..HEAD)
- [ ] All commits mode
- [ ] Commit rows (hash, message, time, clickable)
- [ ] Empty state for branch mode

### Phase 5 — CI/CD Section
- [ ] `CiSection` component
- [ ] Workflow grouping (by first " / " segment)
- [ ] Single-check flat render
- [ ] Multi-check collapsible groups
- [ ] Status icons (CheckCircle, XCircle, spinner, Circle)
- [ ] Group summary (X failed / X pending / all passed)
- [ ] Clickable rows open URL
- [ ] Hidden when gh unavailable

### Phase 6 — Integration & Polish
- [ ] 3-section layout with dividers in GitActivityPanel
- [ ] Loading skeleton (3-section)
- [ ] Polling: PR 60s, CI adaptive 10s/30s, commits on mount+event
- [ ] Activity tab badge (green dot open PR, pulse creating)
- [ ] Listen for `pr:created` Wails event
- [ ] Remove old "Load activity" button and empty state
- [ ] Cleanup unused CSS styles

---

## Engineering Standards
- [ ] Follows existing v2 patterns (SolidJS, Vanilla Extract, charmbracelet/log)
- [ ] No inline styles (except simple one-off overrides)
- [ ] TypeScript strict — no `any`
- [ ] Graceful degradation when `gh` not available
- [ ] All Go bindings logged with charmbracelet/log

---

## CI Gates
- [ ] `go build ./internal/app/...` passes
- [ ] `pnpm typecheck:tsc` passes (from feature-web-apps)
- [ ] No new TypeScript errors
- [ ] Wails dev starts without errors

---

## Quality Bar
- [ ] Loading skeletons, not blank states
- [ ] Adaptive CI polling (fast when pending, slow when settled)
- [ ] PR creation is fully async (non-blocking UI)
- [ ] All sections match v1 feature parity
- [ ] Accessible (keyboard nav on clickable rows)
