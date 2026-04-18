# Phase 1: Core — Implementation Plan

**Author:** Subash Karki
**Date:** 2026-04-18
**Phase:** 1 of 7
**Status:** Ready for implementation
**Depends on:** Phase 0 (Wails v2 + Solid.js shell)

---

## Goal

Stand up the foundational services that every subsequent phase depends on: SQLite persistence, terminal PTY management, session discovery via filesystem collectors, project detection, and worktree management. By the end of Phase 1, a user can launch PhantomOS v2 and see a list of externally-started Claude sessions, open a terminal pane connected to a real PTY, browse detected projects, and manage git worktrees — all backed by a durable SQLite database with type-safe queries.

---

## Prerequisites

- Phase 0 complete: Wails v2 desktop shell renders a Solid.js "Hello Phantom" window
- Go module initialized (`go.mod` with `module github.com/subash-karki/phantom-os-v2`)
- Solid.js + Vite + `vite-plugin-solid` configured in `frontend/`
- Wails bindings verified: a Go method can be called from Solid.js and a Wails Event can be received

---

## Tasks

### 1. SQLite Setup with modernc.org/sqlite

**1.1** Install dependencies
```
go get modernc.org/sqlite
go get github.com/golang-migrate/migrate/v4
go get github.com/sqlc-dev/sqlc (build-time tool — `go install`)
```

**1.2** Create database connection module
- **File:** `internal/db/sqlite.go`
- Open `~/.phantom-os/phantom.db` (create `~/.phantom-os/` if missing)
- Enable WAL mode: `PRAGMA journal_mode=WAL`
- Set busy timeout: `PRAGMA busy_timeout=5000`
- Enable foreign keys: `PRAGMA foreign_keys=ON`
- Connection pool: single writer, multiple readers (WAL allows concurrent reads)
- Expose `func New(dbPath string) (*sql.DB, error)` and `func Close() error`
- On startup, run migrations automatically

**1.3** Write migration SQL files (v1 schema port)
- **Directory:** `internal/db/migrations/`
- **File:** `internal/db/migrations/001_initial_schema.up.sql`
- **File:** `internal/db/migrations/001_initial_schema.down.sql`

Port every v1 table with **exact column names** preserved for migration compatibility:

```sql
-- sessions (from v1 schema.ts)
CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    pid             INTEGER,
    cwd             TEXT,
    repo            TEXT,
    name            TEXT,
    kind            TEXT,
    model           TEXT,
    entrypoint      TEXT,
    started_at      INTEGER,
    ended_at        INTEGER,
    status          TEXT DEFAULT 'active',
    task_count      INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    xp_earned       INTEGER DEFAULT 0,
    input_tokens    INTEGER DEFAULT 0,
    output_tokens   INTEGER DEFAULT 0,
    cache_read_tokens  INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    estimated_cost_micros INTEGER DEFAULT 0,
    message_count   INTEGER DEFAULT 0,
    tool_use_count  INTEGER DEFAULT 0,
    first_prompt    TEXT,
    tool_breakdown  TEXT,
    last_input_tokens INTEGER DEFAULT 0,
    context_used_pct  INTEGER
);

-- tasks
CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    session_id  TEXT REFERENCES sessions(id),
    task_num    INTEGER,
    subject     TEXT,
    description TEXT,
    crew        TEXT,
    status      TEXT DEFAULT 'pending',
    active_form TEXT,
    blocks      TEXT,
    blocked_by  TEXT,
    created_at  INTEGER,
    updated_at  INTEGER,
    duration_ms INTEGER
);

-- hunter_profile
CREATE TABLE IF NOT EXISTS hunter_profile (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    name            TEXT DEFAULT 'Hunter',
    level           INTEGER DEFAULT 1,
    xp              INTEGER DEFAULT 0,
    xp_to_next      INTEGER DEFAULT 100,
    rank            TEXT DEFAULT 'E',
    title           TEXT DEFAULT 'Awakened',
    total_sessions  INTEGER DEFAULT 0,
    total_tasks     INTEGER DEFAULT 0,
    total_repos     INTEGER DEFAULT 0,
    streak_current  INTEGER DEFAULT 0,
    streak_best     INTEGER DEFAULT 0,
    last_active_date TEXT,
    created_at      INTEGER
);

-- hunter_stats
CREATE TABLE IF NOT EXISTS hunter_stats (
    id           INTEGER PRIMARY KEY DEFAULT 1,
    strength     INTEGER DEFAULT 10,
    intelligence INTEGER DEFAULT 10,
    agility      INTEGER DEFAULT 10,
    vitality     INTEGER DEFAULT 10,
    perception   INTEGER DEFAULT 10,
    sense        INTEGER DEFAULT 10
);

-- achievements
CREATE TABLE IF NOT EXISTS achievements (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    icon        TEXT,
    category    TEXT,
    xp_reward   INTEGER DEFAULT 50,
    unlocked_at INTEGER
);

-- daily_quests
CREATE TABLE IF NOT EXISTS daily_quests (
    id         TEXT PRIMARY KEY,
    date       TEXT NOT NULL,
    quest_type TEXT NOT NULL,
    label      TEXT NOT NULL,
    target     INTEGER NOT NULL,
    progress   INTEGER DEFAULT 0,
    completed  INTEGER DEFAULT 0,
    xp_reward  INTEGER DEFAULT 25
);

-- activity_log
CREATE TABLE IF NOT EXISTS activity_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp  INTEGER NOT NULL,
    type       TEXT NOT NULL,
    session_id TEXT,
    metadata   TEXT,
    xp_earned  INTEGER DEFAULT 0
);

-- projects
CREATE TABLE IF NOT EXISTS projects (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    repo_path         TEXT NOT NULL UNIQUE,
    default_branch    TEXT DEFAULT 'main',
    worktree_base_dir TEXT,
    color             TEXT,
    profile           TEXT,
    starred           INTEGER DEFAULT 0,
    created_at        INTEGER NOT NULL
);

-- workspace_sections (v1 table name preserved)
CREATE TABLE IF NOT EXISTS workspace_sections (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id),
    name         TEXT NOT NULL,
    tab_order    INTEGER DEFAULT 0,
    is_collapsed INTEGER DEFAULT 0,
    color        TEXT,
    created_at   INTEGER NOT NULL
);

-- workspaces (v1 table name for worktrees — preserved)
CREATE TABLE IF NOT EXISTS workspaces (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id),
    type          TEXT NOT NULL,
    name          TEXT NOT NULL,
    branch        TEXT NOT NULL,
    worktree_path TEXT,
    port_base     INTEGER,
    section_id    TEXT REFERENCES workspace_sections(id),
    base_branch   TEXT,
    tab_order     INTEGER DEFAULT 0,
    is_active     INTEGER DEFAULT 0,
    ticket_url    TEXT,
    created_at    INTEGER NOT NULL
);

-- chat_conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT,
    title        TEXT NOT NULL,
    model        TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

-- chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES chat_conversations(id),
    workspace_id    TEXT,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    model           TEXT,
    created_at      INTEGER NOT NULL
);

-- pane_states
CREATE TABLE IF NOT EXISTS pane_states (
    worktree_id TEXT PRIMARY KEY,
    state       TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);

-- terminal_sessions
CREATE TABLE IF NOT EXISTS terminal_sessions (
    pane_id        TEXT PRIMARY KEY,
    worktree_id    TEXT,
    shell          TEXT,
    cwd            TEXT,
    env            TEXT,
    cols           INTEGER,
    rows           INTEGER,
    scrollback     TEXT,
    status         TEXT DEFAULT 'active',
    started_at     INTEGER,
    last_active_at INTEGER,
    ended_at       INTEGER
);

-- user_preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- graph_nodes
CREATE TABLE IF NOT EXISTS graph_nodes (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id),
    type         TEXT NOT NULL,
    path         TEXT,
    name         TEXT,
    content_hash TEXT,
    metadata     TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

-- graph_edges
CREATE TABLE IF NOT EXISTS graph_edges (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    source_id  TEXT NOT NULL REFERENCES graph_nodes(id),
    target_id  TEXT NOT NULL REFERENCES graph_nodes(id),
    type       TEXT NOT NULL,
    weight     INTEGER DEFAULT 1,
    metadata   TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- graph_meta
CREATE TABLE IF NOT EXISTS graph_meta (
    project_id     TEXT PRIMARY KEY REFERENCES projects(id),
    last_built_at  INTEGER,
    last_updated_at INTEGER,
    file_count     INTEGER DEFAULT 0,
    edge_count     INTEGER DEFAULT 0,
    layer2_count   INTEGER DEFAULT 0,
    coverage       INTEGER DEFAULT 0
);

-- v2-only tables
CREATE TABLE IF NOT EXISTS session_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    type       TEXT NOT NULL,
    data       TEXT,
    timestamp  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_policies (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id),
    policy     TEXT NOT NULL DEFAULT 'supervised',
    updated_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_log_session ON activity_log(session_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_project_id ON workspaces(project_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_project ON graph_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_project ON graph_edges(project_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_session_events_timestamp ON session_events(timestamp);
```

**1.4** Write sqlc query files
- **Config:** `sqlc.yaml` (project root)
- **Directory:** `internal/db/queries/`
- **Files:**
  - `internal/db/queries/sessions.sql` — CRUD for sessions table, list active, list by status, update tokens, update status
  - `internal/db/queries/tasks.sql` — CRUD for tasks, list by session, update status, increment session task count
  - `internal/db/queries/projects.sql` — CRUD for projects, list all, find by repo_path
  - `internal/db/queries/worktrees.sql` — CRUD for workspaces table, list by project, update active status
  - `internal/db/queries/terminal.sql` — CRUD for terminal_sessions, snapshot scrollback, find by worktree
  - `internal/db/queries/activity.sql` — Insert activity log, list recent by session
  - `internal/db/queries/preferences.sql` — Get/set user preferences

**1.5** Generate Go types from sqlc
- **Output:** `internal/db/models.go` (auto-generated)
- **Output:** `internal/db/queries.sql.go` (auto-generated)
- Run `sqlc generate` and verify all types compile

**1.6** Write v1 database import logic
- **File:** `internal/db/import.go`
- On first v2 launch, detect `~/.phantom-os/phantom.db` from v1
- If v1 DB exists, copy data into v2 schema (column names match, so `INSERT INTO ... SELECT ...`)
- Mark import as complete in `user_preferences` table (`v1_imported=true`)
- Log import results (rows migrated per table)

---

### 2. Terminal Manager with creack/pty

**2.1** Install dependency
```
go get github.com/creack/pty
```

**2.2** Implement terminal session struct
- **File:** `internal/terminal/session.go`
- Struct `Session`:
  - `ID string`
  - `PTY *os.File` (creack/pty file descriptor)
  - `Cmd *exec.Cmd` (shell process)
  - `Ctx context.Context`, `Cancel context.CancelFunc`
  - `Listeners []chan []byte` (output subscribers)
  - `Scrollback *RingBuffer` (64KB ring buffer for cold restore)
  - `Cols, Rows uint16`
  - `CWD string`
  - `CreatedAt time.Time`
- Method `Start(ctx context.Context)` — goroutine that reads PTY fd and fans out to listeners + scrollback
- Method `Write(data []byte)` — write to PTY input
- Method `Resize(cols, rows uint16)` — `pty.Setsize()`
- Method `Close()` — send SIGHUP to shell process, close PTY fd, cancel context

**2.3** Implement terminal manager
- **File:** `internal/terminal/manager.go`
- Struct `Manager`:
  - `sessions sync.Map` (map[string]*Session)
  - `db *sql.DB` (for cold restore persistence)
- Method `Create(id, cwd string, cols, rows uint16) (*Session, error)`:
  - Resolve shell: check `$SHELL`, fall back to `/bin/zsh`, `/bin/bash`, `/bin/sh`
  - Build clean env (strip `ELECTRON_RUN_AS_NODE`, `npm_config_prefix`; ensure `TERM=xterm-256color`, `PATH` includes `/usr/local/bin`)
  - `exec.CommandContext(ctx, shell, "--login")` with CWD
  - `pty.StartWithSize(cmd, &pty.Winsize{Cols: cols, Rows: rows})`
  - Start reader goroutine
  - Store in sessions map
- Method `Get(id string) *Session`
- Method `Write(id string, data []byte) error`
- Method `Resize(id string, cols, rows uint16) error`
- Method `Destroy(id string)` — close session, remove from map
- Method `DestroyAll()` — graceful shutdown
- Method `List() []SessionInfo` — return all active session metadata

**2.4** Implement cold restore
- **File:** `internal/terminal/restore.go`
- Background goroutine: every 10 seconds, snapshot all active sessions to `terminal_sessions` table
  - Write: `pane_id`, `worktree_id`, `shell`, `cwd`, `cols`, `rows`, `scrollback` (ring buffer contents), `last_active_at`
- On startup: query `terminal_sessions` where `status='active'`
  - For each: create new PTY session at same CWD, inject scrollback buffer with banner `"--- Previous session restored ---\r\n"`
  - Mark old record as restored

**2.5** Implement ring buffer utility
- **File:** `internal/terminal/ringbuffer.go`
- Fixed-size byte ring buffer (default 64KB, matching v1 `SCROLLBACK_MAX`)
- Thread-safe with `sync.Mutex`
- Methods: `Write([]byte)`, `Bytes() []byte`, `Len() int`, `Reset()`

---

### 3. Session Collectors (Filesystem Watchers)

All collectors run as dedicated goroutines with `context.Context` cancellation. They implement the `Collector` interface:

```go
type Collector interface {
    Name() string
    Start(ctx context.Context) error
    Stop() error
}
```

**3.1** Install dependency
```
go get github.com/fsnotify/fsnotify
```

**3.2** Session Watcher
- **File:** `internal/collector/session_watcher.go`
- Port from: `packages/server/src/collectors/session-watcher.ts`
- Watch `~/.claude/sessions/` for `.json` files via `fsnotify`
- On file add/change: read JSON, extract `sessionId`/`id`, `pid`, `cwd`, `name`, `kind`, `entrypoint`, `startedAt`
- Upsert into `sessions` table (same logic as v1 `upsertSession`)
- Check PID liveness with `syscall.Kill(pid, 0)` (signal 0 = check alive, no signal sent)
- On file delete: mark session as `completed`, set `ended_at`
- Stale session detection goroutine: every 5 seconds, query active sessions, check PID + JSONL idle time
  - PID dead -> completed
  - No PID + age > 10 min -> completed
  - JSONL idle > 5 min + no PID -> completed
- Context bridge: read `~/.claude/phantom-os/context/<sessionId>.json` for live `contextUsedPct`
- Emit Wails Events: `session:new`, `session:update`, `session:end`, `session:stale`, `session:context`

**3.3** JSONL Scanner
- **File:** `internal/collector/jsonl_scanner.go`
- Port from: `packages/server/src/collectors/jsonl-scanner.ts`
- Scan `~/.claude/projects/` for all `.jsonl` files
- Stream-parse each file line-by-line (Go `bufio.Scanner` — equivalent to v1's `readline.createInterface`)
- Extract per-session: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `lastInputTokens`, `messageCount`, `toolUseCount`, `toolBreakdown` (JSON map), `firstPrompt`, `model`, `startedAt`, `endedAt`
- Calculate `estimatedCostMicros` using model pricing table (port `getModelPricing`)
- Upsert into `sessions` table — skip sessions already enriched (inputTokens > 0)
- Active context poller: every 10 seconds, tail-read last 50KB of active sessions' JSONL files for latest token context
- Periodic rescan: every 60 seconds, re-enrich sessions with 0 tokens (handles race between session-watcher creating the record and JSONL being populated)
- Track rescan attempts per session, cap at 5 retries
- Emit Wails Events: `jsonl:scan-complete`, `jsonl:rescan`, `session:context`

**3.4** Activity Poller
- **File:** `internal/collector/activity_poller.go`
- Port from: `packages/server/src/collectors/activity-poller.ts`
- Every 5 seconds, poll active sessions' JSONL files
- Track per-file byte offset (like v1 `fileOffsets` map) — only read new bytes since last poll
- Find active JSONL by CWD (most recently modified `.jsonl` in the project dir) — handles `/clear` rotation
- Parse new chunks, extract activity events:
  - Tool calls: Read, Edit, Write, Bash, Grep, Glob, Agent, Skill, MCP tools
  - Git operations: commit, push, checkout/branch detected from Bash commands
  - User messages, assistant text responses
- Persist events to `activity_log` table
- Batch all events across sessions, emit single Wails Event `activity` per poll tick (cap at 100 events)
- Tool event metadata: icon, category, detail extraction (file path, command, pattern, skill name)

**3.5** Task Watcher
- **File:** `internal/collector/task_watcher.go`
- Port from: `packages/server/src/collectors/task-watcher.ts`
- Watch `~/.claude/tasks/` recursively via `fsnotify` (tasks stored as `tasks/<sessionId>/<taskId>.json`)
- On file add/change (debounced 200ms): read JSON, extract task fields
- Composite key: `<sessionId>:<rawId>` to avoid cross-session collisions
- Parse crew from subject (port `parseCrew` utility)
- Upsert into `tasks` table, increment session's `task_count` on new task
- Skip orphan tasks (no matching session in DB)
- Backfill session name from first task subject if session has no name
- On status change to `completed`: trigger callback for XP engine
- Emit Wails Events: `task:new`, `task:update`

**3.6** Todo Watcher
- **File:** `internal/collector/todo_watcher.go`
- Port from: `packages/server/src/collectors/todo-watcher.ts`
- Watch `~/.claude/todos/` for `.json` files via `fsnotify`
- Parse TodoWrite JSON arrays: `[{ content, status, activeForm }]`
- Session ID extracted from filename: `<sessionId>-agent-*.json` -> `sessionId`
- Map to tasks table with ID `<sessionId>:todo-<index>`
- Handle removals: if a todo disappears from the array, mark as `completed`
- On status change to `completed`: trigger XP callback
- Emit Wails Events: `task:new`, `task:update`

**3.7** Collector registry / lifecycle manager
- **File:** `internal/collector/registry.go`
- Struct `Registry`:
  - `collectors []Collector`
  - `ctx context.Context`, `cancel context.CancelFunc`
- Method `Register(c Collector)`
- Method `StartAll(ctx context.Context) error` — start each collector as a goroutine
- Method `StopAll()` — cancel context, wait for all collectors to drain
- Use `sourcegraph/conc` error group for structured shutdown

---

### 4. Project Detector

**4.1** Implement detector
- **File:** `internal/project/detector.go`
- Port from: `packages/server/src/project-detector.ts`
- Struct `Profile`:
  - `Type string` — `"python"`, `"node"`, `"monorepo"`, `"infra"`, `"go"`, `"rust"`, `"unknown"`
  - `BuildSystem string`
  - `Recipes []Recipe`
  - `EnvNeeds []string`
  - `Detected bool`
  - `DetectedAt int64`
- Struct `Recipe`:
  - `ID, Label, Command, Icon, Description string`
  - `Category string` — `"setup"`, `"test"`, `"lint"`, `"build"`, `"serve"`, `"deploy"`, `"custom"`
  - `Auto bool`
- Function `Detect(repoPath string) Profile`:
  - Check for: `pyproject.toml`, `package.json`, `Makefile`, `Cargo.toml`, `go.mod`, `nx.json`, `turbo.json`
  - Determine project type and build system (same priority logic as v1)
  - Extract recipes from: Makefile targets, package.json scripts, pyproject.toml scripts, Cargo/Go standard commands, Nx targets
  - Detect package manager: pnpm (pnpm-lock.yaml), bun (bun.lock/bun.lockb), npm (default)
  - Detect env needs: python version, node version, docker, env vars, aws-cli, rust, go
  - Deduplicate recipes by ID, cap at 75
- Run detection as a goroutine — never block startup
- Persist `Profile` as JSON in `projects.profile` column

**4.2** Implement recipe extractors (sub-functions)
- `extractMakefileRecipes(repoPath string) []Recipe` — grep `^[a-zA-Z_-]+:` from Makefile
- `extractNpmRecipes(repoPath string) []Recipe` — parse package.json scripts
- `extractPythonRecipes(repoPath string) []Recipe` — parse pyproject.toml scripts, detect pytest/ruff
- `extractNxRecipes() []Recipe` — static Nx commands
- `extractCargoRecipes() []Recipe` — static Cargo commands
- `extractGoRecipes() []Recipe` — static Go commands

**4.3** Helper utilities
- `categorize(name string) string` — keyword-based category detection (same regex as v1)
- `humanize(target string) string` — "sam-deploy" -> "SAM Deploy"
- `iconForCategory(category string) string` — emoji mapping

---

### 5. Worktree Manager

**5.1** Implement worktree operations
- **File:** `internal/git/worktree.go`
- Port from: `packages/server/src/worktree-manager.ts`
- Constants: `WORKTREE_ROOT = ~/.phantom-os/worktrees`
- Function `GetWorktreeDir(projectName, branchName string) string` — sanitize names, build path
- Function `Create(repoPath, branch, targetDir string, baseBranch string) error`:
  - `os.MkdirAll(targetDir, 0755)`
  - Fetch latest base branch (with 15s timeout, offline-safe)
  - Check if branch exists (`git rev-parse --verify`)
  - If exists: `git worktree add <targetDir> <branch>`
  - If not: `git worktree add -b <branch> <targetDir> [baseBranch]`
  - Run git commands via `exec.CommandContext` with `context.Context` for cancellation
- Function `Remove(worktreePath string) error`:
  - Find main repo via `git rev-parse --git-common-dir`
  - `git worktree remove <path> --force`
  - Fallback: `git worktree prune` if remove fails
- Function `List(repoPath string) ([]WorktreeInfo, error)`:
  - `git worktree list --porcelain`
  - Parse output: extract path, HEAD commit, branch (strip `refs/heads/`), bare flag
- Function `Discover(rootDir string) ([]WorktreeInfo, error)`:
  - Walk `WORKTREE_ROOT` subdirectories
  - Validate each is a git worktree
- Struct `WorktreeInfo`: `Path, Branch, Commit string; IsBare bool`

**5.2** Supporting git utilities
- **File:** `internal/git/operations.go` (minimal set needed for Phase 1)
- `GetDefaultBranch(repoPath string) string` — try symbolic-ref, fall back to main/master
- `IsGitRepo(path string) bool` — `git rev-parse --git-dir`
- `GetRepoName(repoPath string) string` — `filepath.Base(repoPath)`
- `HasUncommittedChanges(repoPath string) (bool, string)` — `git status --porcelain`
- `CheckoutBranch(repoPath, branch string) error`
- `CreateAndCheckoutBranch(repoPath, branch string, baseBranch string) error`
- All commands use `exec.CommandContext` with timeouts (30s default)

---

### 6. Wails Bindings

**6.1** Session bindings
- **File:** `internal/app/bindings_sessions.go`
- `GetSessions() []Session` — list all sessions
- `GetActiveSessions() []Session` — list active sessions only
- `GetSession(id string) *Session` — single session by ID
- `GetSessionTasks(sessionId string) []Task` — tasks for a session
- `GetActivityLog(sessionId string, limit int) []ActivityEntry` — recent activity

**6.2** Terminal bindings
- **File:** `internal/app/bindings_terminal.go`
- `CreateTerminal(id, cwd string, cols, rows int) error` — create PTY session
- `WriteTerminal(id string, data string) error` — send input to PTY
- `ResizeTerminal(id string, cols, rows int) error` — resize PTY
- `DestroyTerminal(id string) error` — kill PTY
- `GetTerminalScrollback(id string) string` — return ring buffer contents
- Note: terminal output streams via WebSocket, not bindings (see 6.5)

**6.3** Project bindings
- **File:** `internal/app/bindings_projects.go`
- `GetProjects() []Project` — list all projects
- `AddProject(repoPath string) (*Project, error)` — detect + persist
- `RemoveProject(id string) error`
- `DetectProject(repoPath string) *ProjectProfile` — run detector, return profile
- `GetProjectRecipes(projectId string) []Recipe`

**6.4** Worktree bindings
- **File:** `internal/app/bindings_git.go`
- `CreateWorktree(projectId, branch string, baseBranch string) (*Worktree, error)`
- `RemoveWorktree(worktreeId string) error`
- `ListWorktrees(projectId string) []Worktree`
- `GetDefaultBranch(repoPath string) string`

**6.5** WebSocket hub for terminal streaming
- **File:** `internal/stream/hub.go`
- Install: `go get nhooyr.io/websocket`
- Single WebSocket connection per app instance, multiplexed by session ID
- Message format: `{ "session": "<id>", "type": "terminal:data" | "terminal:exit", "data": "<base64>" }`
- Go side: terminal manager registers a listener per session that writes to the WebSocket
- Solid side: receives messages, routes to correct xterm.js instance by session ID
- Goroutine per active WebSocket connection with context cancellation

**6.6** Wails event emission helpers
- **File:** `internal/app/events.go`
- Thin wrappers around `runtime.EventsEmit()` with typed payloads
- `EmitSessionEvent(ctx context.Context, eventName string, payload interface{})`
- All collector broadcasts route through here

---

### 7. Frontend: Basic Session List + Terminal Pane

**7.1** Solid.js session signal
- **File:** `frontend/src/signals/sessions.ts`
- `createSignal<Session[]>([])` — populated on mount via `GetSessions()` binding
- Subscribe to Wails Events: `sessions:updated`, `session:new`, `session:update`, `session:end`
- Export `useSessions()` accessor

**7.2** Session list component
- **File:** `frontend/src/components/sidebar/SessionList.tsx`
- Render sessions using Solid's `<For>` (keyed by `session.id`)
- Show: session name (or repo, or truncated ID), status badge (active/completed), model, token count, cost
- Active sessions highlighted, sorted by `started_at` desc
- Click session -> sets active session signal
- Use Kobalte `Collapsible` for grouping by status

**7.3** Terminal pane component
- **File:** `frontend/src/components/terminal/Terminal.tsx`
- Mount xterm.js instance (framework-agnostic — `@xterm/xterm` + `@xterm/addon-webgl`)
- On mount: call `CreateTerminal` binding with session ID and dimensions
- Connect to WebSocket for output streaming — filter messages by session ID
- Wire xterm.js `onData` -> `WriteTerminal` binding (or WebSocket write)
- Wire `onResize` -> `ResizeTerminal` binding
- On unmount: detach listeners (do NOT destroy PTY — keep alive for reattach)
- Cold restore: on mount, call `GetTerminalScrollback`, write to xterm.js before connecting live stream

**7.4** Layout shell
- **File:** `frontend/src/app.tsx`
- Two-pane layout: sidebar (SessionList) + main area (Terminal)
- Active session context determines which terminal is shown
- Use CSS grid or flexbox — no component library needed for Phase 1 layout
- Basic Vanilla Extract theme tokens (Phase 1 minimal: background, foreground, accent colors)

**7.5** Wails event subscription helpers
- **File:** `frontend/src/wails/events.ts`
- `onWailsEvent<T>(name: string, handler: (data: T) => void): () => void`
- Uses `@solid-primitives/event-listener` or direct Wails `EventsOn`/`EventsOff`
- Auto-cleanup via Solid's `onCleanup`

---

### 8. App Wiring (main.go)

**8.1** Wails app entry point
- **File:** `cmd/phantomos/main.go`
- Initialize SQLite database (run migrations)
- Create terminal manager
- Create collector registry, register all 5 collectors
- Create project detector service
- Create worktree manager
- Start collector registry (`registry.StartAll(ctx)`)
- Start terminal cold restore
- Start WebSocket hub
- Register all Wails bindings
- `wails.Run()` with `OnStartup` (init services), `OnShutdown` (graceful teardown: stop collectors, destroy all PTYs, close DB)

**8.2** Graceful shutdown
- On app close: cancel root context -> all collector goroutines drain
- Terminal manager: send SIGHUP to all PTYs, snapshot scrollback to DB
- WebSocket hub: close all connections
- SQLite: close DB connection (WAL checkpoint happens automatically)

---

## Acceptance Criteria

### SQLite
- [ ] Database creates at `~/.phantom-os/phantom.db` on first launch
- [ ] WAL mode enabled (verify with `PRAGMA journal_mode`)
- [ ] All v1 tables created with exact column names
- [ ] sqlc generates valid Go types that compile
- [ ] Migrations run idempotently (running twice is safe)
- [ ] v1 database import works when v1 phantom.db exists

### Terminal
- [ ] PTY spawns user's login shell (`$SHELL` or `/bin/zsh --login`)
- [ ] Typing in xterm.js sends input to PTY, output appears in xterm.js
- [ ] Resize propagates from xterm to PTY (verify with `tput cols; tput lines`)
- [ ] Terminal survives pane switch (PTY stays alive, reattach shows scrollback)
- [ ] Cold restore: kill app, relaunch -> terminal pane shows last scrollback with restore banner
- [ ] `vim`, `htop`, `top` work correctly in the terminal (ncurses compat)
- [ ] Graceful shutdown: SIGHUP sent to all PTYs on app close

### Collectors
- [ ] Session watcher: start a Claude session in iTerm -> it appears in PhantomOS session list within 5 seconds
- [ ] JSONL scanner: on boot, historical sessions populated with token counts and costs
- [ ] Activity poller: while a Claude session is active, activity events stream to the UI every 5 seconds
- [ ] Task watcher: tasks created by Claude appear in session detail
- [ ] Todo watcher: todos created via TodoWrite appear as tasks
- [ ] Stale detection: kill a Claude process -> session marked completed within 10 seconds
- [ ] All collectors stop cleanly on app shutdown (no goroutine leaks)

### Project Detector
- [ ] Detects Node, Python, Go, Rust, monorepo, and infra project types
- [ ] Extracts recipes from package.json, Makefile, pyproject.toml, Cargo.toml, go.mod
- [ ] Detects package manager (pnpm, bun, npm) correctly
- [ ] Returns env needs (python version, node version, docker, etc.)
- [ ] Detection runs as goroutine, never blocks startup

### Worktree Manager
- [ ] Create worktree for a project + branch -> directory appears under `~/.phantom-os/worktrees/`
- [ ] List worktrees returns correct branch and commit info
- [ ] Remove worktree cleans up directory and git state
- [ ] Default branch detection works (main/master fallback)
- [ ] Offline-safe: create worktree works without network (skip fetch)

### Frontend
- [ ] Session list renders on app launch with all discovered sessions
- [ ] Active sessions show green status indicator
- [ ] Clicking a session opens a terminal pane connected to a real PTY
- [ ] Multiple terminals can be opened (one per session)
- [ ] Terminal is responsive (xterm.js WebGL renderer)
- [ ] Wails events update session list in real-time (no page refresh)

### Integration
- [ ] App starts in < 2 seconds (SQLite + collector startup)
- [ ] Memory usage < 80MB idle with no active terminals
- [ ] No goroutine leaks on shutdown (verify with `runtime.NumGoroutine()` logging)

---

## Estimated Effort

| Task | Estimate |
|------|----------|
| SQLite setup + migrations + sqlc | 2-3 days |
| Terminal manager (PTY + ring buffer + cold restore) | 3-4 days |
| Session watcher + stale detection | 1-2 days |
| JSONL scanner + context poller + periodic rescan | 2-3 days |
| Activity poller | 1-2 days |
| Task watcher + Todo watcher | 1-2 days |
| Project detector | 1 day |
| Worktree manager + git utilities | 1-2 days |
| Wails bindings + WebSocket hub | 2 days |
| Frontend: session list + terminal pane | 2-3 days |
| App wiring + graceful shutdown | 1 day |
| Integration testing + bug fixing | 2-3 days |
| **Total** | **17-25 days (~2-3 weeks)** |

---

## Key Decisions

1. **Column names preserved exactly** from v1 Drizzle schema. The Go struct fields use `CamelCase` but sqlc maps them to the snake_case column names. This ensures v1 -> v2 data import is a simple `INSERT INTO ... SELECT ...`.

2. **fsnotify over polling** for session/task/todo watchers. v1 used chokidar (Node file watcher). Go's fsnotify is the direct equivalent. The activity poller and JSONL context poller still use periodic polling (same as v1) because they tail-read file offsets rather than watching for creation events.

3. **Single WebSocket, multiplexed by session ID** for terminal streaming. Wails bindings are request/response only — unsuitable for streaming terminal bytes at 60+ events/sec. The WebSocket runs alongside Wails, not as a replacement.

4. **creack/pty spawns `--login` shell** to ensure all user config (oh-my-zsh, PATH, aliases) is loaded. Same behavior as v1's node-pty setup.

5. **sourcegraph/conc** for structured concurrency in the collector registry. Safer than raw goroutines — provides error propagation and guaranteed cleanup.

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| modernc.org/sqlite perf | Benchmark early. If queries > 10ms, switch to `mattn/go-sqlite3` (CGo) |
| fsnotify macOS limits | macOS default kqueue limit is 256 open files. Collectors watch ~5 directories. Well within limits |
| PTY resource leaks | Every PTY goroutine uses `context.Context`. Root context cancel on shutdown guarantees cleanup |
| JSONL files > 50MB | Stream parse with `bufio.Scanner`, never load full file into memory. Tail-read uses 50KB window |
| WebSocket vs Wails conflict | WebSocket runs on a separate port. Wails bindings handle everything except streaming data |

---

## File Summary

```
internal/
  db/
    sqlite.go                    # Connection, WAL, migrations
    import.go                    # v1 data import
    migrations/
      001_initial_schema.up.sql  # Full schema DDL
      001_initial_schema.down.sql
    queries/
      sessions.sql               # sqlc queries
      tasks.sql
      projects.sql
      worktrees.sql
      terminal.sql
      activity.sql
      preferences.sql
    models.go                    # sqlc-generated (do not edit)
    queries.sql.go               # sqlc-generated (do not edit)
  terminal/
    manager.go                   # PTY lifecycle
    session.go                   # Per-session goroutine
    restore.go                   # Cold restore snapshots
    ringbuffer.go                # 64KB scrollback buffer
  collector/
    registry.go                  # Collector lifecycle manager
    session_watcher.go           # ~/.claude/sessions/ watcher
    jsonl_scanner.go             # JSONL parser + context poller
    activity_poller.go           # Real-time activity feed
    task_watcher.go              # ~/.claude/tasks/ watcher
    todo_watcher.go              # ~/.claude/todos/ watcher
  project/
    detector.go                  # Project type + recipe detection
  git/
    worktree.go                  # Worktree CRUD
    operations.go                # Basic git utilities
  stream/
    hub.go                       # WebSocket hub (terminal streaming)
  app/
    bindings_sessions.go         # Wails: session CRUD
    bindings_terminal.go         # Wails: terminal control
    bindings_projects.go         # Wails: project management
    bindings_git.go              # Wails: worktree operations
    events.go                    # Wails event emission
cmd/
  phantomos/
    main.go                      # App entry, service wiring
frontend/
  src/
    signals/
      sessions.ts                # Session reactive state
    components/
      sidebar/
        SessionList.tsx           # Session list
      terminal/
        Terminal.tsx              # xterm.js PTY pane
    wails/
      events.ts                  # Event subscription helpers
    app.tsx                       # Layout shell
sqlc.yaml                        # sqlc configuration
```
