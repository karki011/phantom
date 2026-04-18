# Phase 2: Parallel Git Operations + All New Git Features

**Author:** Subash Karki
**Date:** 2026-04-18
**Status:** Draft
**Depends on:** Phase 1 (SQLite, worktree manager, terminal manager, project detector)
**Spec:** `2026-04-18-phantomos-v2-design.md` Section 4

---

## Goal

Full rewrite of the v1 git layer (git-pool.ts, git-worker.ts, worktree-manager.ts, worktrees.ts, worktree-files.ts) into Go with true parallelism via goroutine pools. Port all existing v1 operations, then build every new git feature — graph visualization, conflict resolution, interactive rebase, inline blame, stash management, cherry-pick, diff viewer, tag management, submodule support, and bisect helper. Ship matching Solid.js frontend components for each feature. Nothing deferred.

---

## Prerequisites

From Phase 1 (must be complete):
- SQLite database with `worktrees`, `projects` tables via sqlc
- Worktree Manager (Go) — CRUD for worktrees on disk
- Terminal Manager (Go) — PTY sessions per worktree
- Project Detector (Go) — repo discovery, profile detection
- Wails v2 shell running with Solid.js frontend
- Wails event bus operational (`runtime.EventsEmit` / `EventsOn`)

---

## Architecture Overview

```
                    Solid.js Frontend
                         │
          ┌──────────────┼──────────────┐
          │ Wails Bindings              │ Wails Events
          │ (request/response)          │ (push: status, progress)
          ▼                             ▼
   internal/app/bindings_git.go    internal/app/events.go
          │
          ▼
   internal/git/
   ├── pool.go          ← sourcegraph/conc goroutine pool
   ├── worktree.go      ← worktree CRUD (ported from worktree-manager.ts)
   ├── status.go        ← parallel status across all worktrees
   ├── operations.go    ← stage, commit, push, fetch, pull, discard, etc.
   ├── branch.go        ← checkout, create, list, default detection
   ├── diff.go          ← unified + side-by-side diff generation
   ├── log.go           ← commit history, graph topology
   ├── blame.go         ← inline blame per file
   ├── stash.go         ← stash CRUD with preview
   ├── cherry_pick.go   ← cherry-pick with conflict detection
   ├── rebase.go        ← interactive rebase plan + execution
   ├── merge.go         ← merge + conflict resolution
   ├── tag.go           ← tag CRUD (lightweight + annotated)
   ├── submodule.go     ← submodule init/update/status
   ├── bisect.go        ← bisect start/good/bad/reset with visual marking
   ├── graph.go         ← branch topology graph (DAG) generation
   ├── pr.go            ← PR creation via gh CLI
   ├── commit_msg.go    ← AI commit message generation via claude CLI
   └── types.go         ← shared types (GitStatus, DiffHunk, BlameEntry, etc.)
```

---

## Tasks

### Part A: Core Git Pool + Ported Operations (Port from v1)

#### A.1. Goroutine Pool — `internal/git/pool.go`

Port v1's single-worker `git-pool.ts` to a Go goroutine pool using `sourcegraph/conc`.

```go
// Key design decisions:
// - Default concurrency: 8 (configurable via config.yaml)
// - Uses conc.Pool for structured concurrency (panic recovery, error collection)
// - context.Context on every operation for timeout + cancellation
// - No fallback path needed — Go exec is already non-blocking per goroutine
```

**Tasks:**
1. Create `internal/git/pool.go` with `GitPool` struct wrapping `conc.Pool`
2. `NewGitPool(concurrency int) *GitPool` — constructor with configurable max goroutines
3. `pool.Exec(ctx context.Context, repoPath string, args []string) (GitResult, error)` — core exec function. Uses `os/exec.CommandContext` for cancellation. Returns stdout, stderr, exit code
4. `pool.ExecAll(ctx context.Context, tasks []GitTask) []GitResult` — fan-out using `conc.Pool.Go()`, collects all results
5. `pool.Shutdown()` — waits for in-flight ops, then stops accepting new work
6. Default timeout: 30s per operation (overridable per-call via context)
7. Wire pool as singleton in `internal/app/` — injected into all git service constructors

**v1 mapping:**
- `git-pool.ts:runGitTask()` → `pool.Exec()`
- `git-pool.ts:fallbackExec()` → eliminated (Go exec is inherently concurrent)
- `git-pool.ts:shutdownGitPool()` → `pool.Shutdown()`
- `git-worker.ts:buildGitArgs()` → moved to each domain file (status.go, log.go, etc.)

#### A.2. Shared Types — `internal/git/types.go`

```go
// Port from v1 worktree-files.ts GitFileChange + GitStatusResult
```

**Tasks:**
1. Create `internal/git/types.go` with all shared structs:
   - `GitResult` — stdout, stderr, exitCode, error
   - `GitStatus` — added, modified, deleted, untracked, ahead, behind, files[]
   - `FileChange` — status (added/modified/deleted/renamed/untracked), path, code, staged bool
   - `DiffHunk` — old start/count, new start/count, lines[]
   - `DiffFile` — path, old path (rename), hunks[], is binary
   - `DiffLine` — type (add/delete/context), content, old line num, new line num
   - `BlameEntry` — sha, author, date, line start, line count, content
   - `CommitInfo` — sha, short sha, message, author, email, date, parents[], url
   - `BranchInfo` — name, is remote, is current, tracking, ahead, behind
   - `StashEntry` — index, message, date, branch
   - `TagInfo` — name, sha, message (annotated), tagger, date, is annotated
   - `SubmoduleInfo` — name, path, url, sha, status (initialized/uninitialized/modified)
   - `BisectState` — current sha, good[], bad[], remaining, steps[]
   - `ConflictFile` — path, ours content, theirs content, base content, conflict markers
   - `RebasePlan` — steps[] (pick/reword/edit/squash/fixup/drop), onto, branch
   - `GraphNode` — sha, parents[], children[], x position, y position, color index
   - `GraphEdge` — from sha, to sha, color index
2. All types get `json` struct tags for Wails binding auto-generation to TypeScript

#### A.3. Worktree Operations — `internal/git/worktree.go`

Port v1's `worktree-manager.ts` entirely.

**Tasks:**
1. `CreateWorktree(ctx, repoPath, branch, targetDir, baseBranch) error` — port from v1 `createWorktree()`. Fetch first, check if branch exists, create with `-b` flag if new
2. `RemoveWorktree(ctx, worktreePath) error` — port from v1 `removeWorktree()`. Resolve git-common-dir, force remove, fallback to prune
3. `ListWorktrees(ctx, repoPath) ([]WorktreeInfo, error)` — port from v1 `listWorktrees()`. Parse `--porcelain` output
4. `DiscoverWorktrees(ctx, repoPath) ([]WorktreeInfo, error)` — enhanced: also check `~/.phantom-os/worktrees/` for orphaned worktrees
5. `GetWorktreeDir(projectName, branchName) string` — port path sanitization from v1
6. `GetLiveBranch(ctx, worktreePath) (string, error)` — port from v1 `getLiveBranch()`

#### A.4. Branch Operations — `internal/git/branch.go`

Port branch operations from v1 `worktrees.ts` and `worktree-manager.ts`.

**Tasks:**
1. `CheckoutBranch(ctx, repoPath, branch) error` — port from v1 `checkoutBranch()`
2. `CreateAndCheckoutBranch(ctx, repoPath, branch, baseBranch) error` — port from v1 `createAndCheckoutBranch()`
3. `ListBranches(ctx, repoPath) ([]BranchInfo, error)` — port from v1 git-worker `branch-list` op. Parse both local and remote. Include tracking info, ahead/behind counts
4. `GetDefaultBranch(ctx, repoPath) string` — port from v1 `getDefaultBranch()` / `getDefaultBranchAsync()`. Check symbolic-ref → main → master fallback
5. `DeleteBranch(ctx, repoPath, branch, force) error` — new: `git branch -d/-D`
6. `RenameBranch(ctx, repoPath, oldName, newName) error` — new: `git branch -m`

#### A.5. Status Operations — `internal/git/status.go`

Port v1's `parseGitStatus()` from `worktree-files.ts`, add parallel multi-worktree status.

**Tasks:**
1. `GetStatus(ctx, repoPath) (GitStatus, error)` — port from v1 `parseGitStatus()`. Runs `git --no-optional-locks status -b --porcelain --untracked-files=all`. Parses XY format, extracts ahead/behind from branch line
2. `GetStatusAll(ctx, worktrees []string) map[string]GitStatus` — **NEW**: fan-out using `pool.ExecAll()` to get status for ALL worktrees in parallel. This is the key v2 improvement — v1 was sequential (~500ms per worktree)
3. `HasUncommittedChanges(ctx, repoPath) (bool, string)` — port from v1 `hasUncommittedChanges()`
4. Background goroutine: `StartPeriodicStatus(ctx, interval, worktrees, callback)` — polls all worktrees on interval (default 5s), emits `git:status` Wails event only on change (diff-based)

#### A.6. Core Git Actions — `internal/git/operations.go`

Port all actions from v1's `worktrees.ts` POST `/worktrees/:id/git` handler.

**Tasks:**
1. `Stage(ctx, repoPath, paths []string) error` — port: `git add -- <paths>`. Include stale lock cleanup
2. `Unstage(ctx, repoPath, paths []string) error` — port: `git reset HEAD -- <paths>`
3. `StageAll(ctx, repoPath) error` — port: `git add -A` with lock cleanup
4. `Commit(ctx, repoPath, message, authorName, authorEmail) error` — port: `git commit -m`. Handle identity fallback from user preferences (v1 reads from DB)
5. `Fetch(ctx, repoPath) error` — port: `git fetch origin --prune`
6. `Pull(ctx, repoPath) error` — `git pull --ff-only` (safe default)
7. `Push(ctx, repoPath, branch, setUpstream) error` — `git push` / `git push -u origin <branch>`
8. `Discard(ctx, repoPath, paths []string) error` — port: `git checkout -- <paths>` with lock cleanup
9. `DiscardAll(ctx, repoPath) error` — port: `git checkout -- . && git clean -fd`
10. `Clean(ctx, repoPath, paths []string) error` — port: `git clean -f -- <paths>`
11. `UndoCommit(ctx, repoPath) error` — port: `git reset --soft HEAD~1`
12. `ClearStaleLock(repoPath) error` — port from v1 `clearStaleLock()`. Resolve git-dir, remove index.lock

#### A.7. Commit History — `internal/git/log.go`

Port from v1's `recent-commits` action and git-worker `log` op.

**Tasks:**
1. `GetRecentCommits(ctx, repoPath, limit, baseBranch, scoped) ([]CommitInfo, error)` — port from v1 `recent-commits`. Format: `%H|%h|%s|%an|%ae|%aI|%P`. Include remote URL detection for commit links
2. `GetCommitDetail(ctx, repoPath, sha) (CommitDetail, error)` — new: full commit info + diff stat + changed files
3. `GetCommitDiff(ctx, repoPath, sha) ([]DiffFile, error)` — new: full diff for a specific commit
4. `GetFileHistory(ctx, repoPath, filePath, limit) ([]CommitInfo, error)` — new: `git log --follow -- <path>`

#### A.8. Diff Operations — `internal/git/diff.go`

Port v1's `git-diff` route, add side-by-side and syntax highlighting.

**Tasks:**
1. `GetWorkingDiff(ctx, repoPath, filePath) (DiffFile, error)` — port from v1 `git-diff` route: HEAD version vs working copy
2. `GetStagedDiff(ctx, repoPath) ([]DiffFile, error)` — `git diff --cached`
3. `GetCommitDiff(ctx, repoPath, sha) ([]DiffFile, error)` — `git diff <sha>~1..<sha>`
4. `GetBranchDiff(ctx, repoPath, base, head) ([]DiffFile, error)` — `git diff <base>...<head>`
5. `ParseUnifiedDiff(raw string) []DiffHunk` — parser for unified diff format into structured hunks with line numbers
6. `GenerateSideBySide(hunks []DiffHunk) SideBySideDiff` — transform unified hunks into paired left/right lines for side-by-side view. Each line gets: type (add/delete/modify/context), content, line number

#### A.9. PR and CI — `internal/git/pr.go`

Port from v1's `create-pr`, `pr-status`, `ci-runs` actions.

**Tasks:**
1. `CreatePR(ctx, repoPath, broadcast) error` — port: spawn `claude -p "/commit-push-pr"` in background goroutine. Emit `pr:success` / `pr:error` Wails events. Track in-flight set to prevent duplicates
2. `GetPRStatus(ctx, repoPath) (*PRInfo, error)` — port: `gh pr view --json url,state,title,number,headRefName,baseRefName`
3. `GetCIRuns(ctx, repoPath) ([]CIRun, error)` — port: try `gh pr checks` first, fall back to `gh run list --branch`. Deduplicate by workflow name
4. `GenerateCommitMessage(ctx, repoPath, broadcast) error` — port: gather staged diff + stat + recent log, spawn `claude -p` with commit message prompt. Emit `commit-msg:ready` / `commit-msg:error`. Include 60s timeout, cancellation support via context

#### A.10. Background Periodic Fetch — `internal/git/operations.go`

**Tasks:**
1. `StartPeriodicFetch(ctx, repos []string, interval time.Duration)` — goroutine that fetches all tracked repos periodically (default: 5 minutes). Uses `pool.ExecAll()` for parallel fetch across repos
2. Emits `git:fetch-complete` Wails event per repo with ahead/behind delta
3. Respects context cancellation for clean shutdown
4. Skip repos currently in the middle of user-initiated operations (mutex per repo path)

#### A.11. Wails Bindings — `internal/app/bindings_git.go`

Expose all git operations as Wails bindings (replacing v1's Hono HTTP routes).

**Tasks:**
1. One Go method per operation — Wails auto-generates TypeScript types from Go structs
2. Methods grouped by domain:
   - `GitGetStatus(worktreeID) GitStatus`
   - `GitGetStatusAll() map[string]GitStatus`
   - `GitStage(worktreeID, paths) error`
   - `GitUnstage(worktreeID, paths) error`
   - `GitCommit(worktreeID, message) error`
   - `GitFetch(worktreeID) error`
   - `GitPush(worktreeID) error`
   - `GitPull(worktreeID) error`
   - `GitDiscard(worktreeID, paths) error`
   - `GitDiscardAll(worktreeID) error`
   - `GitUndoCommit(worktreeID) error`
   - `GitStash(worktreeID) error`
   - `GitStashPop(worktreeID) error`
   - `GitCheckout(worktreeID, branch) error`
   - `GitCreateBranch(worktreeID, branch, baseBranch) error`
   - `GitGetBranches(worktreeID) []BranchInfo`
   - `GitGetRecentCommits(worktreeID, scoped) []CommitInfo`
   - `GitGetDiff(worktreeID, path) DiffFile`
   - `GitGetStagedDiff(worktreeID) []DiffFile`
   - `GitCreatePR(worktreeID) error`
   - `GitGetPRStatus(worktreeID) *PRInfo`
   - `GitGetCIRuns(worktreeID) []CIRun`
   - `GitGenerateCommitMsg(worktreeID) error`
   - `GitCancelCommitMsg(worktreeID) error`
   - (Blame, stash manager, rebase, merge, tag, cherry-pick, submodule, bisect, graph — listed in Part B)
3. All methods resolve worktreeID → repoPath via SQLite lookup
4. All methods use `context.Context` from Wails runtime

---

### Part B: New Git Features (full rewrite — nothing deferred)

#### B.1. Git Graph Visualization — `internal/git/graph.go`

Interactive branch topology as a DAG (directed acyclic graph).

**Tasks:**
1. `GetGraph(ctx, repoPath, maxCommits) (GitGraph, error)` — run `git log --all --oneline --graph --format="%H|%P|%D|%s|%an|%aI" --topo-order -<max>`. Parse into structured graph
2. `GitGraph` struct: nodes (sha, parents, refs, message, author, date, x, y, color), edges (from, to, color)
3. Layout algorithm: assign x-position per branch lane, y-position by topological order. Color-code branches consistently (main=blue, feature branches rotate colors)
4. `GetGraphForBranch(ctx, repoPath, branch, maxCommits) (GitGraph, error)` — scoped to single branch ancestry
5. Wails binding: `GitGetGraph(worktreeID, maxCommits) GitGraph`
6. Wails binding: `GitGetGraphForBranch(worktreeID, branch, maxCommits) GitGraph`

**Layout algorithm detail:**
```
1. Parse git log output into commit nodes with parent references
2. Identify branch heads (from %D decoration)
3. Assign columns: main branch gets column 0, each branch fork gets next available column
4. Walk topological order, assign y-positions (row index)
5. Generate edges between parent→child with routing (straight, merge curve)
6. Resolve crossing minimization (swap adjacent columns if it reduces crossings)
```

#### B.2. Merge Conflict Resolution — `internal/git/merge.go`

Three-way merge conflict UI with accept ours/theirs/both/manual resolution.

**Tasks:**
1. `Merge(ctx, repoPath, branch) (*MergeResult, error)` — run `git merge <branch>`. Detect conflicts from exit code + porcelain status
2. `GetConflicts(ctx, repoPath) ([]ConflictFile, error)` — find all UU (unmerged) files, extract ours/theirs/base content using `git show :1:<path>` (base), `:2:<path>` (ours), `:3:<path>` (theirs)
3. `ResolveConflict(ctx, repoPath, path, resolution) error` — resolution is one of: `ours`, `theirs`, `both`, `manual` (with provided content). Writes resolved content, stages file
4. `AbortMerge(ctx, repoPath) error` — `git merge --abort`
5. `ContinueMerge(ctx, repoPath) error` — `git merge --continue` (after all conflicts resolved)
6. Wails bindings: `GitMerge`, `GitGetConflicts`, `GitResolveConflict`, `GitAbortMerge`, `GitContinueMerge`

#### B.3. Interactive Rebase Viewer — `internal/git/rebase.go`

Visual rebase plan editor with reorder, squash, fixup, drop.

**Tasks:**
1. `GetRebasePlan(ctx, repoPath, onto) (RebasePlan, error)` — generate the todo list that `git rebase -i` would produce. Run `git log --oneline <onto>..HEAD --reverse` to build plan steps
2. `StartRebase(ctx, repoPath, plan RebasePlan) error` — write plan to `GIT_SEQUENCE_EDITOR` env var as script, run `git rebase -i <onto>` non-interactively. Uses `GIT_SEQUENCE_EDITOR="cat <planfile>"` pattern
3. `ContinueRebase(ctx, repoPath) error` — `git rebase --continue`
4. `AbortRebase(ctx, repoPath) error` — `git rebase --abort`
5. `SkipRebase(ctx, repoPath) error` — `git rebase --skip`
6. `GetRebaseProgress(ctx, repoPath) (*RebaseProgress, error)` — read `.git/rebase-merge/` directory to determine current step, total steps, current commit
7. Wails bindings: `GitGetRebasePlan`, `GitStartRebase`, `GitContinueRebase`, `GitAbortRebase`, `GitSkipRebase`, `GitGetRebaseProgress`

**Rebase plan editing in UI:**
- User sees list of commits with action dropdowns (pick/reword/squash/fixup/drop)
- Drag-and-drop reordering
- Submit sends modified plan to `StartRebase`

#### B.4. Inline Blame Integration — `internal/git/blame.go`

Per-line blame data for any file, keyed by line range for efficiency.

**Tasks:**
1. `GetBlame(ctx, repoPath, filePath) ([]BlameEntry, error)` — run `git blame --porcelain <path>`. Parse porcelain format into structured entries: sha, author, author-time, line content, line number
2. `GetBlameRange(ctx, repoPath, filePath, startLine, endLine) ([]BlameEntry, error)` — `git blame -L <start>,<end> --porcelain <path>`. For lazy loading visible lines only
3. `GetBlameForCommit(ctx, repoPath, filePath, sha) ([]BlameEntry, error)` — blame at a specific commit: `git blame <sha> -- <path>`
4. Wails bindings: `GitGetBlame`, `GitGetBlameRange`, `GitGetBlameForCommit`

#### B.5. Stash Manager with Preview — `internal/git/stash.go`

Full stash CRUD with diff preview before applying.

**Tasks:**
1. `StashSave(ctx, repoPath, message, includeUntracked) error` — `git stash push -m "<msg>"` (optionally with `-u` for untracked)
2. `StashList(ctx, repoPath) ([]StashEntry, error)` — `git stash list --format="%gd|%gs|%ci"`. Parse index, message, date
3. `StashShow(ctx, repoPath, index) ([]DiffFile, error)` — `git stash show -p stash@{<index>}`. Returns full diff for preview
4. `StashApply(ctx, repoPath, index) error` — `git stash apply stash@{<index>}`
5. `StashPop(ctx, repoPath, index) error` — `git stash pop stash@{<index>}`
6. `StashDrop(ctx, repoPath, index) error` — `git stash drop stash@{<index>}`
7. `StashClear(ctx, repoPath) error` — `git stash clear`
8. `StashBranch(ctx, repoPath, index, branchName) error` — `git stash branch <name> stash@{<index>}`. Create branch from stash
9. Wails bindings: `GitStashSave`, `GitStashList`, `GitStashShow`, `GitStashApply`, `GitStashPop`, `GitStashDrop`, `GitStashClear`, `GitStashBranch`

#### B.6. Cherry-Pick UI — `internal/git/cherry_pick.go`

Cherry-pick one or multiple commits with conflict handling.

**Tasks:**
1. `CherryPick(ctx, repoPath, shas []string) (*CherryPickResult, error)` — `git cherry-pick <sha1> <sha2>...`. Detect conflicts, return status
2. `CherryPickContinue(ctx, repoPath) error` — `git cherry-pick --continue`
3. `CherryPickAbort(ctx, repoPath) error` — `git cherry-pick --abort`
4. `CherryPickStatus(ctx, repoPath) (*CherryPickProgress, error)` — check `.git/CHERRY_PICK_HEAD` existence + sequence progress
5. Wails bindings: `GitCherryPick`, `GitCherryPickContinue`, `GitCherryPickAbort`, `GitCherryPickStatus`

#### B.7. Tag Management — `internal/git/tag.go`

Lightweight and annotated tags with push support.

**Tasks:**
1. `ListTags(ctx, repoPath) ([]TagInfo, error)` — `git tag -l --sort=-creatordate --format="%(refname:short)|%(objectname:short)|%(objecttype)|%(creatordate:iso)|%(subject)|%(taggername)"`. Parse into structured list
2. `CreateTag(ctx, repoPath, name, message, sha) error` — if message provided: `git tag -a <name> -m "<msg>" <sha>`, else: `git tag <name> <sha>`
3. `DeleteTag(ctx, repoPath, name, deleteRemote) error` — `git tag -d <name>`. If deleteRemote: `git push origin --delete <name>`
4. `PushTag(ctx, repoPath, name) error` — `git push origin <name>`
5. `PushAllTags(ctx, repoPath) error` — `git push origin --tags`
6. Wails bindings: `GitListTags`, `GitCreateTag`, `GitDeleteTag`, `GitPushTag`, `GitPushAllTags`

#### B.8. Submodule Support — `internal/git/submodule.go`

Submodule status, init, update, and sync.

**Tasks:**
1. `ListSubmodules(ctx, repoPath) ([]SubmoduleInfo, error)` — parse `.gitmodules` + `git submodule status`. Extract name, path, url, sha, initialized status
2. `InitSubmodules(ctx, repoPath) error` — `git submodule init`
3. `UpdateSubmodules(ctx, repoPath, recursive) error` — `git submodule update --init` (optionally `--recursive`)
4. `SyncSubmodules(ctx, repoPath) error` — `git submodule sync`
5. `GetSubmoduleStatus(ctx, repoPath) ([]SubmoduleInfo, error)` — `git submodule status --recursive`
6. Wails bindings: `GitListSubmodules`, `GitInitSubmodules`, `GitUpdateSubmodules`, `GitSyncSubmodules`

#### B.9. Bisect Helper with Visual Marking — `internal/git/bisect.go`

Interactive bisect with visual good/bad marking on commit graph.

**Tasks:**
1. `BisectStart(ctx, repoPath, badSha, goodSha) (*BisectState, error)` — `git bisect start <bad> <good>`. Return current test commit + estimated remaining steps
2. `BisectGood(ctx, repoPath) (*BisectState, error)` — `git bisect good`. Return next test commit or result
3. `BisectBad(ctx, repoPath) (*BisectState, error)` — `git bisect bad`. Return next test commit or result
4. `BisectSkip(ctx, repoPath) (*BisectState, error)` — `git bisect skip`
5. `BisectReset(ctx, repoPath) error` — `git bisect reset`
6. `BisectLog(ctx, repoPath) ([]BisectStep, error)` — `git bisect log`. Parse to structured steps with sha + verdict
7. `BisectVisualize(ctx, repoPath) (*BisectVisualization, error)` — combine bisect log with graph topology. Mark commits as good (green), bad (red), skipped (yellow), untested (gray), current (highlighted)
8. Wails bindings: `GitBisectStart`, `GitBisectGood`, `GitBisectBad`, `GitBisectSkip`, `GitBisectReset`, `GitBisectLog`, `GitBisectVisualize`

---

### Part C: Solid.js Frontend Components

All components in `frontend/src/components/git/`.

#### C.1. StatusDashboard.tsx

Parallel status view across all worktrees.

**Tasks:**
1. Create `frontend/src/components/git/StatusDashboard.tsx`
2. Subscribe to `git:status` Wails event → `createSignal<Record<string, GitStatus>>()`
3. Render grid of worktree status cards — each shows: branch name, ahead/behind badges, file change counts (added/modified/deleted/untracked)
4. Color-coded: green (clean), yellow (changes), red (conflicts)
5. Click card → navigate to that worktree's ChangesView
6. "Refresh All" button calls `GitGetStatusAll()` binding
7. Auto-refresh via periodic status goroutine (no polling from frontend — Go pushes)

#### C.2. BranchSwitcher.tsx

Branch picker with search, create, and delete.

**Tasks:**
1. Create `frontend/src/components/git/BranchSwitcher.tsx`
2. Use Kobalte `Select` (headless) for dropdown with search filter
3. Sections: Local Branches, Remote Branches (grouped)
4. Current branch highlighted with checkmark
5. "New Branch" option at top → inline input with optional base branch selector
6. Right-click branch → Delete (with confirmation dialog)
7. Calls `GitGetBranches()`, `GitCheckout()`, `GitCreateBranch()`, `GitDeleteBranch()` bindings

#### C.3. ChangesView.tsx

Staged/unstaged file change management.

**Tasks:**
1. Create `frontend/src/components/git/ChangesView.tsx`
2. Two sections: "Staged Changes" and "Changes" (unstaged + untracked)
3. Each file row: status icon (M/A/D/?), file path, stage/unstage toggle button
4. Batch actions: "Stage All", "Unstage All", "Discard All" (with confirmation)
5. Click file → opens DiffViewer for that file
6. Right-click file → context menu: Stage, Unstage, Discard, Open in Editor
7. Commit box at bottom: message input + "Generate" (AI) button + "Commit" button
8. Subscribe to `commit-msg:ready` event for AI-generated messages
9. Calls `GitGetStatus()`, `GitStage()`, `GitUnstage()`, `GitStageAll()`, `GitCommit()`, `GitDiscard()`, `GitDiscardAll()`, `GitGenerateCommitMsg()`, `GitCancelCommitMsg()`

#### C.4. CommitHistory.tsx

Scrollable commit log with scoped/full toggle.

**Tasks:**
1. Create `frontend/src/components/git/CommitHistory.tsx`
2. Virtualized list using `@tanstack/solid-virtual` (handles 1000s of commits)
3. Each row: short SHA (monospace, clickable → commit detail), message, author, relative time
4. Toggle: "Branch commits only" (scoped) vs "All commits"
5. Click commit → expand to show full diff + changed files
6. Link icon → opens commit URL in browser (GitHub/GitLab)
7. Right-click commit → Cherry-pick, Revert, Create tag, Start bisect from here
8. Calls `GitGetRecentCommits()`, `GitGetCommitDetail()`, `GitGetCommitDiff()`

#### C.5. GitGraph.tsx

Interactive branch topology visualization.

**Tasks:**
1. Create `frontend/src/components/git/GitGraph.tsx`
2. Canvas-based rendering (HTML5 Canvas or SVG) for the DAG
3. Nodes: circles at (x, y) positions from `GitGraph` data. Color by branch
4. Edges: curved lines connecting parent → child. Merge edges curve from side lanes
5. Labels: branch/tag names as badges at HEAD commits
6. Interaction: click node → show commit detail tooltip. Double-click → expand commit in CommitHistory
7. Pan + zoom with mouse/trackpad
8. Toggle: show all branches, current branch only, or select branches
9. Mini-map for navigation on large graphs
10. Calls `GitGetGraph()`, `GitGetGraphForBranch()`

#### C.6. DiffViewer.tsx

Side-by-side + unified diff viewer with syntax highlighting.

**Tasks:**
1. Create `frontend/src/components/git/DiffViewer.tsx`
2. Two modes toggle: "Unified" (traditional git diff) and "Side-by-Side"
3. Unified mode: green lines (added), red lines (deleted), gray (context). Line numbers on left gutter
4. Side-by-side mode: left panel (old), right panel (new). Synchronized scrolling. Changed lines highlighted, inline word-level diff highlighting
5. Syntax highlighting using a lightweight highlighter (Shiki or Prism, loaded on demand)
6. Hunk headers (@@) as collapsible section dividers
7. "Copy line" button on hover
8. File header: old path → new path (for renames)
9. Binary file detection — show "Binary file changed" message
10. Accepts `DiffFile` prop or loads via `GitGetDiff()` binding

#### C.7. BlameView.tsx

Inline blame annotation for any file.

**Tasks:**
1. Create `frontend/src/components/git/BlameView.tsx`
2. Left gutter: blame annotations — author avatar/initial, short SHA, relative date. Alternate row backgrounds to group contiguous blocks from same commit
3. Right side: file content with syntax highlighting and line numbers
4. Hover blame block → tooltip: full SHA, author name, email, full date, commit message
5. Click SHA → navigates to that commit in CommitHistory
6. Lazy loading: only fetch blame for visible line range (via `GitGetBlameRange()`)
7. Option to view blame at a specific commit (history navigation)
8. Calls `GitGetBlame()`, `GitGetBlameRange()`, `GitGetBlameForCommit()`

#### C.8. StashManager.tsx

Stash list with preview and actions.

**Tasks:**
1. Create `frontend/src/components/git/StashManager.tsx`
2. List of stashes: index badge, message, date, branch name
3. Click stash → expand to show diff preview (calls `GitStashShow()`)
4. Actions per stash: Apply, Pop, Drop (with confirmation), Create Branch
5. Top actions: "Stash Changes" button (with optional message input, include untracked toggle), "Clear All" (with confirmation)
6. Empty state: "No stashes" with explanation
7. Calls `GitStashSave()`, `GitStashList()`, `GitStashShow()`, `GitStashApply()`, `GitStashPop()`, `GitStashDrop()`, `GitStashClear()`, `GitStashBranch()`

#### C.9. RebaseViewer.tsx

Interactive rebase plan editor.

**Tasks:**
1. Create `frontend/src/components/git/RebaseViewer.tsx`
2. Entry: select "onto" branch/commit → calls `GitGetRebasePlan()` → displays plan
3. Plan table: each row is a commit. Columns: action dropdown (pick/reword/squash/fixup/drop), SHA (short), commit message
4. Drag-and-drop row reordering (solid-dnd or manual pointer events)
5. Action dropdown changes row color: pick=blue, reword=yellow, squash=purple, fixup=gray, drop=red-strikethrough
6. "Start Rebase" button → sends modified plan to `GitStartRebase()`
7. During rebase: progress indicator showing current step / total. "Continue", "Skip", "Abort" buttons
8. If conflicts arise during rebase → switches to ConflictResolver
9. Calls `GitGetRebasePlan()`, `GitStartRebase()`, `GitContinueRebase()`, `GitAbortRebase()`, `GitSkipRebase()`, `GitGetRebaseProgress()`

#### C.10. ConflictResolver.tsx

Three-way merge conflict resolution UI.

**Tasks:**
1. Create `frontend/src/components/git/ConflictResolver.tsx`
2. File list on left: all conflicted files with status indicators
3. Main panel: three-pane view — Base (center-top), Ours (left), Theirs (right)
4. Conflict regions highlighted: red (ours), blue (theirs), gray (base)
5. Per-conflict actions: "Accept Ours", "Accept Theirs", "Accept Both", "Edit Manually"
6. Merged result preview at bottom — updates in real-time as user resolves conflicts
7. "Mark Resolved" per file → calls `GitResolveConflict()` with resolved content
8. "Resolve All" with strategy (all ours / all theirs)
9. "Abort Merge/Rebase" button always visible
10. File navigation: previous/next conflicted file
11. Calls `GitGetConflicts()`, `GitResolveConflict()`, `GitAbortMerge()`, `GitContinueMerge()`

---

### Part D: Signals Layer + Event Integration

#### D.1. Git Signals — `frontend/src/signals/git.ts`

**Tasks:**
1. Create `frontend/src/signals/git.ts`
2. Shared signals:
   ```typescript
   export const [gitStatuses, setGitStatuses] = createSignal<Record<string, GitStatus>>({});
   export const [currentBranch, setCurrentBranch] = createSignal<string>('');
   export const [branches, setBranches] = createSignal<BranchInfo[]>([]);
   export const [isLoading, setIsLoading] = createSignal(false);
   export const [commitMsgStatus, setCommitMsgStatus] = createSignal<'idle'|'generating'|'ready'|'error'>('idle');
   export const [generatedCommitMsg, setGeneratedCommitMsg] = createSignal('');
   export const [bisectState, setBisectState] = createSignal<BisectState | null>(null);
   export const [rebaseProgress, setRebaseProgress] = createSignal<RebaseProgress | null>(null);
   export const [conflicts, setConflicts] = createSignal<ConflictFile[]>([]);
   ```
3. Event subscriptions (in `frontend/src/wails/events.ts`):
   ```typescript
   EventsOn('git:status', (data) => setGitStatuses(data));
   EventsOn('commit-msg:ready', (data) => { setGeneratedCommitMsg(data.message); setCommitMsgStatus('ready'); });
   EventsOn('commit-msg:error', (data) => setCommitMsgStatus('error'));
   EventsOn('pr:success', (data) => /* toast notification */);
   EventsOn('pr:error', (data) => /* toast notification */);
   EventsOn('git:fetch-complete', (data) => /* update ahead/behind */);
   ```

#### D.2. TypeScript Types — `frontend/src/types/git.ts`

**Tasks:**
1. Create `frontend/src/types/git.ts`
2. Mirror all Go types from `internal/git/types.go` — Wails generates most of these, but WebSocket event types need manual definitions
3. Types: `GitStatus`, `FileChange`, `DiffFile`, `DiffHunk`, `DiffLine`, `BlameEntry`, `CommitInfo`, `BranchInfo`, `StashEntry`, `TagInfo`, `SubmoduleInfo`, `BisectState`, `ConflictFile`, `RebasePlan`, `GraphNode`, `GraphEdge`, `GitGraph`

---

### Part E: Testing

#### E.1. Go Unit Tests

**Tasks:**
1. `internal/git/pool_test.go` — test concurrent execution, timeout, cancellation, pool shutdown
2. `internal/git/status_test.go` — test `parseGitStatus()` with various porcelain outputs (staged, unstaged, renames, conflicts, ahead/behind)
3. `internal/git/diff_test.go` — test `ParseUnifiedDiff()` with hunks, binary files, renames. Test `GenerateSideBySide()` alignment
4. `internal/git/blame_test.go` — test porcelain blame parsing
5. `internal/git/log_test.go` — test commit parsing, graph topology generation
6. `internal/git/graph_test.go` — test layout algorithm with merge commits, octopus merges, detached HEADs
7. `internal/git/rebase_test.go` — test plan generation, non-interactive rebase execution
8. `internal/git/merge_test.go` — test conflict detection, three-way content extraction
9. `internal/git/bisect_test.go` — test state tracking, visualization marking
10. All tests use `t.TempDir()` with `git init` to create disposable repos — no mocking of git itself

#### E.2. Integration Tests

**Tasks:**
1. `internal/git/integration_test.go` — end-to-end test: create repo → make commits → create worktree → parallel status → verify correctness
2. Test parallel status across 5+ worktrees completes in <500ms
3. Test conflict resolution flow: create divergent branches → merge → resolve → verify
4. Test rebase flow: create commits → rebase onto new base → verify history
5. Test bisect flow: create repo with known-bad commit → bisect → verify identification

#### E.3. Solid.js Component Tests

**Tasks:**
1. `StatusDashboard.test.tsx` — mock Wails events, verify status card rendering
2. `DiffViewer.test.tsx` — render unified + side-by-side modes, verify line alignment
3. `ChangesView.test.tsx` — stage/unstage interactions, commit flow
4. `GitGraph.test.tsx` — verify node positioning, edge routing
5. `ConflictResolver.test.tsx` — accept ours/theirs flow, manual resolution
6. Use `@solidjs/testing-library` + `vitest`

---

### Part F: File Explorer Integration

Port v1's `worktree-files.ts` routes to Wails bindings.

#### F.1. File Operations — `internal/app/bindings_files.go`

**Tasks:**
1. `FileList(worktreeID, path) []FileEntry` — port from v1 `GET /worktrees/:id/files`. Include gitignore-aware filtering
2. `FileSearch(worktreeID, query, limit) []FileEntry` — port from v1 `GET /worktrees/:id/files/search`. Recursive walk with SKIP_DIRS
3. `FileRead(worktreeID, path) FileContent` — port from v1 `GET /worktrees/:id/file`. 10MB limit, path sandboxing
4. `FileWrite(worktreeID, path, content) error` — port from v1 `PUT /worktrees/:id/file`
5. `FileDelete(worktreeID, path) error` — port from v1 `DELETE /worktrees/:id/file`
6. `FileCreateDir(worktreeID, path) error` — port from v1 `POST /worktrees/:id/mkdir`
7. Path sandboxing: all paths validated to be within worktree root (port `safePath()` logic)

---

## Wails Events (Go → Solid.js)

| Event Name | Payload | Trigger |
|---|---|---|
| `git:status` | `map[string]GitStatus` | Periodic status poll + after any git action |
| `git:fetch-complete` | `{ worktreeID, ahead, behind }` | Background periodic fetch |
| `commit-msg:ready` | `{ worktreeID, message }` | AI commit msg generation complete |
| `commit-msg:error` | `{ worktreeID, error }` | AI commit msg generation failed |
| `pr:success` | `{ worktreeID, worktreeName, output }` | PR created successfully |
| `pr:error` | `{ worktreeID, worktreeName, error }` | PR creation failed |
| `worktree:setup-start` | `{ worktreeID, command }` | Auto-setup starting |
| `worktree:setup-done` | `{ worktreeID, success, error? }` | Auto-setup complete |

---

## Acceptance Criteria

### Functional
- [ ] All v1 git operations (stage, unstage, commit, fetch, push, pull, discard, stash, PR, commit-msg, status, diff, branch, worktree CRUD) work identically to v1 through Wails bindings
- [ ] Parallel status across 5 worktrees completes in <500ms (v1: ~2.5s sequential)
- [ ] Background periodic fetch runs without blocking any UI operation
- [ ] Git graph renders correctly for repos with merge commits, rebases, and detached HEADs
- [ ] Merge conflict resolution correctly extracts ours/theirs/base and writes resolved content
- [ ] Interactive rebase plan editor correctly generates rebase todo and executes non-interactively
- [ ] Inline blame loads lazily (visible lines only) and navigates between commits
- [ ] Stash manager supports save/list/show/apply/pop/drop/clear/branch operations
- [ ] Cherry-pick handles single and multi-commit selections with conflict detection
- [ ] Side-by-side diff viewer has synchronized scrolling and word-level change highlighting
- [ ] Tag management supports both lightweight and annotated tags with remote push
- [ ] Submodule status shows initialized/uninitialized/modified states with init/update actions
- [ ] Bisect helper tracks state visually on commit graph with good/bad/skip markings

### Performance
- [ ] Goroutine pool handles 8 concurrent git operations without contention
- [ ] Git graph visualization renders 500 commits in <200ms
- [ ] Diff viewer handles files up to 10,000 lines without lag
- [ ] Blame lazy-loads visible range in <100ms
- [ ] Status dashboard updates all worktrees in single parallel batch

### Quality
- [ ] Go unit tests pass with >80% coverage on git package
- [ ] All Go functions use `context.Context` for cancellation
- [ ] All paths validated (no path traversal vulnerabilities)
- [ ] All git operations clear stale locks where applicable
- [ ] Solid.js components use signals (no polling from frontend)
- [ ] TypeScript types auto-generated from Go structs via Wails

---

## Estimated Effort

| Section | Estimate |
|---|---|
| Part A: Core pool + ported operations | 4-5 days |
| Part B: New git features (all 9) | 5-7 days |
| Part C: Solid.js frontend (all 10 components) | 5-7 days |
| Part D: Signals + event integration | 1 day |
| Part E: Testing (Go + Solid) | 2-3 days |
| Part F: File explorer port | 1 day |
| **Total** | **2-3 weeks** |

Note: Effort accounts for the full rewrite scope — all features built from scratch, nothing deferred. Parts A and B can be parallelized (pool first, then operations in any order). Frontend components can start once their corresponding Go bindings are available.

---

## Author

**Subash Karki** — 2026-04-18
