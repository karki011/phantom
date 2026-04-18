# Phase 6: Session Controller

**Author:** Subash Karki
**Date:** 2026-04-18
**Phase:** 6 of PhantomOS v2 Full Rewrite
**Status:** Draft
**Parent spec:** `2026-04-18-phantomos-v2-design.md`

---

## Goal

Build the full Session Controller subsystem for PhantomOS v2. This phase delivers pause/resume with PTY output buffering, session branching (fork state and explore divergent approaches), session rewinding (replay to N tool calls ago), real-time cost tracking from stream-json, multi-session orchestration (side-by-side sessions and output piping), per-session kill/restart with goroutine isolation, configurable session policies (supervised / auto-accept / smart with confidence gating via the AI engine), and the four Solid.js dashboard components: `SessionDashboard.tsx`, `PolicySwitcher.tsx`, `SessionTimeline.tsx`, and `BranchSelector.tsx`.

This phase transforms PhantomOS from a session viewer into a session *controller* -- the user can pause Claude mid-thought, branch to try a different approach, rewind mistakes, and orchestrate multiple sessions as a coordinated workflow.

---

## Prerequisites

All of the following must be complete and stable before Phase 6 work begins:

| Dependency | Phase | What it provides |
|---|---|---|
| Terminal Manager (`internal/terminal/`) | Phase 1 | PTY lifecycle, per-session goroutine + `context.Context`, ring buffer for output |
| Session Collectors (`internal/collector/`) | Phase 1 | Filesystem-based session discovery for externally-started Claude sessions |
| Stream Parser (`internal/stream/`) | Phase 3 | Real-time stream-json parsing, typed event structs, WebSocket broadcast hub |
| Smart View components | Phase 3 | `SessionStream.tsx`, `ToolCallCard.tsx`, `CostTracker.tsx` -- Phase 6 extends these |
| AI Engine (at least Phase 4a parity) | Phase 4a | Required for smart policy mode (confidence scoring via tiered pipeline) |
| Safety Rules Engine (`internal/safety/`) | Phase 5 | Session policies interact with safety rules -- a `block` rule overrides `auto-accept` policy |
| SQLite + sqlc (`internal/db/`) | Phase 1 | Persistence layer for session state, branches, events, policies |
| WebSocket Hub (`internal/stream/hub.go`) | Phase 3 | Multiplexed streaming to frontend per session ID |

---

## Tasks

### 6.1 -- Session Lifecycle Foundation

Extend the existing `internal/session/` package from the basic controller (Phase 1 stub) into a full lifecycle manager.

**6.1.1** `internal/session/types.go` -- Define core session types
- `SessionState` enum: `Running`, `Paused`, `Branched`, `Rewinding`, `Killed`, `Completed`, `Error`
- `Session` struct: ID, parent session ID (for branches), state, policy, creation time, PTY ref, stream parser ref, cost accumulator, branch metadata, context.Context + CancelFunc
- `SessionSnapshot` struct: session ID, event index, tool call count, token totals, timestamp, serialized conversation state (for branch/rewind)
- `SessionBranch` struct: branch ID, parent session ID, fork point (event index), label, creation time, state
- `PipelineLink` struct: source session ID, target session ID, transform func, filter predicate (for orchestration piping)

**6.1.2** `internal/session/controller.go` -- Session Controller (core orchestrator)
- `SessionController` struct holds: session registry (`sync.Map`), branch registry, pipeline links, policy engine ref, AI engine ref, safety engine ref, DB queries ref, event bus
- `Start(ctx, config) (*Session, error)` -- spawn new session goroutine, wire PTY + stream parser + cost tracker
- `Pause(sessionID) error` -- transition to Paused state, buffer PTY output to ring buffer, signal stream parser to hold events
- `Resume(sessionID) error` -- flush buffered output, resume stream parsing, transition back to Running
- `Kill(sessionID) error` -- cancel context, SIGHUP to PTY, cleanup goroutines, persist final state
- `Restart(sessionID) (*Session, error)` -- Kill + Start with same config, new session ID, link to previous
- `GetSession(sessionID) (*Session, error)` -- lookup from registry
- `ListSessions() []*Session` -- all sessions with current state
- `OnEvent(sessionID, event)` -- central event dispatch: updates cost, feeds safety engine, broadcasts to WebSocket, persists to DB
- All methods are goroutine-safe via the session's own mutex (not a global lock)

**6.1.3** `internal/session/goroutine.go` -- Per-session goroutine lifecycle
- `sessionLoop(ctx, session)` -- main select loop per session:
  - `<-ctx.Done()` -- graceful shutdown
  - `<-pauseCh` -- enter pause mode (stop forwarding PTY output to WebSocket, accumulate in ring buffer)
  - `<-resumeCh` -- flush ring buffer to WebSocket, resume forwarding
  - `<-eventCh` -- process incoming stream-json events (cost tracking, policy checks, safety engine)
- Goroutine isolation: each session gets its own `context.WithCancel`. Killing one session never affects another.
- Panic recovery: `defer func() { if r := recover() ... }` logs panic, marks session as Error state, persists snapshot

**6.1.4** `internal/session/pause.go` -- Pause/Resume implementation
- On Pause: set `session.State = Paused`, signal PTY wrapper to redirect output to ring buffer instead of WebSocket
- "Suspend Claude mid-thought": send SIGTSTP to the Claude CLI process group (the PTY child). Claude stops generating. PTY stays alive.
- On Resume: send SIGCONT to the process group. Flush ring buffer contents to WebSocket in order. Resume normal forwarding.
- Edge case: if Claude finishes a tool call during pause (output arrives in buffer), the event is queued and replayed on resume
- Emit Wails event `session:paused` / `session:resumed` so frontend updates immediately

---

### 6.2 -- Session Branching

Enable forking a session's state to explore alternative approaches while keeping both branches.

**6.2.1** `internal/session/branch.go` -- Branching engine
- `Branch(sessionID, label) (*SessionBranch, error)`:
  1. Pause the source session (automatic, user does not need to pause first)
  2. Take a `SessionSnapshot` at the current event index
  3. Create a new session with `ParentSessionID = source`, `ForkPoint = snapshot.EventIndex`
  4. Clone the PTY environment: spawn a new Claude CLI process in the same working directory, with the same CLAUDE.md context
  5. Replay the conversation history up to the fork point into the new session's Claude CLI via `--resume` flag or by piping the JSONL history
  6. Resume the source session (it continues from where it was)
  7. The branch session is now Running independently -- user can give it different instructions
- `ListBranches(sessionID) ([]*SessionBranch, error)` -- all branches (direct children + nested)
- `SwitchBranch(branchID) error` -- bring a branch session to the foreground in the UI (Wails event)
- `MergeBranch(branchID, targetSessionID) error` -- take the file changes from the branch and apply them to the target session's worktree (via `git diff` + `git apply`). Does NOT merge conversation history -- only the filesystem outcome.
- `DeleteBranch(branchID) error` -- kill the branch session, remove from registry, mark as deleted in DB (soft delete)

**6.2.2** `internal/session/snapshot.go` -- Session state serialization
- `TakeSnapshot(session) (*SessionSnapshot, error)`:
  - Read all `session_events` from DB up to current index
  - Capture current token counts (input, output, cache read, cache write)
  - Capture current working directory state (file list + hashes for dirty files)
  - Serialize to a compact format (gob or JSON) stored in `session_snapshots` table
- `RestoreSnapshot(snapshot) (*Session, error)`:
  - Spawn new Claude CLI with `--resume` pointing to the snapshot's JSONL
  - Restore cost accumulator to snapshot values
  - Session starts from snapshot point

**6.2.3** SQL migration -- `internal/db/migrations/00X_session_branches.up.sql`
```sql
CREATE TABLE session_snapshots (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    event_index INTEGER NOT NULL,
    tool_call_count INTEGER NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    working_dir TEXT NOT NULL,
    file_hashes TEXT, -- JSON map of path -> sha256
    snapshot_data BLOB, -- serialized conversation state
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, event_index)
);

CREATE TABLE session_branches (
    id TEXT PRIMARY KEY,
    parent_session_id TEXT NOT NULL REFERENCES sessions(id),
    child_session_id TEXT NOT NULL REFERENCES sessions(id),
    fork_point_event_index INTEGER NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'active', -- active, merged, deleted
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    merged_at TEXT,
    deleted_at TEXT
);

CREATE INDEX idx_branches_parent ON session_branches(parent_session_id);
CREATE INDEX idx_branches_child ON session_branches(child_session_id);
CREATE INDEX idx_snapshots_session ON session_snapshots(session_id);
```

**6.2.4** sqlc queries -- `internal/db/queries/session_branches.sql`
- `CreateSnapshot`, `GetSnapshot`, `ListSnapshotsBySession`
- `CreateBranch`, `GetBranch`, `ListBranchesByParent`, `UpdateBranchState`, `SoftDeleteBranch`
- `GetBranchTree(rootSessionID)` -- recursive CTE to get full branch tree

---

### 6.3 -- Session Rewinding

Allow replaying a session up to N tool calls ago, effectively "undoing" Claude's recent actions.

**6.3.1** `internal/session/rewind.go` -- Rewind engine
- `Rewind(sessionID, targetEventIndex) (*Session, error)`:
  1. Pause the current session
  2. Take a snapshot at current state (so user can "un-rewind" later -- this creates an implicit branch)
  3. Read `session_events` from DB where `session_id = X AND event_index <= targetEventIndex`
  4. Identify file changes made by tool calls after `targetEventIndex` -- build a reverse-diff
  5. Apply reverse-diff to restore the working directory to the target state (via `git stash` + `git checkout` of specific files, or by applying reverse patches)
  6. Spawn a new Claude CLI session, replay the conversation up to `targetEventIndex`
  7. The rewound session is Running and ready for new instructions
- `RewindByToolCalls(sessionID, n) (*Session, error)` -- convenience: rewind N tool calls back
  - Query `session_events` for tool_call events, find the Nth-from-last, call `Rewind` with its index
- `GetRewindPoints(sessionID) ([]RewindPoint, error)` -- list all tool call events as potential rewind targets
  - Each `RewindPoint` has: event index, timestamp, tool name, file affected, summary (first 100 chars of input)
- Safety: rewinding past a `git commit` tool call warns the user (commits are not automatically reverted)
- Safety: rewinding past file deletions restores files from git or from the snapshot's file hashes

**6.3.2** `internal/session/history.go` -- Session event history management
- `GetEventHistory(sessionID, fromIndex, toIndex) ([]StreamEvent, error)` -- paginated event retrieval from `session_events`
- `GetToolCallHistory(sessionID) ([]ToolCallEvent, error)` -- filtered to tool calls only
- `GetEventsBetween(sessionID, startTime, endTime) ([]StreamEvent, error)` -- time-based query
- `CompactHistory(sessionID, beforeIndex) error` -- archive old events to reduce DB size (move to `session_events_archive` table)

---

### 6.4 -- Real-Time Cost Tracking

Parse token usage from stream-json events and maintain running totals per session.

**6.4.1** `internal/session/cost.go` -- Cost tracker (extend from Phase 3 stub)
- `CostTracker` struct per session: input tokens, output tokens, cache read tokens, cache write tokens, estimated cost (USD), model name, last updated timestamp
- `ProcessEvent(event StreamEvent)` -- extract token counts from `usage` field in stream-json `result` events
- Model-aware pricing: maintain a pricing table (config-driven, `~/.phantom-os/config.yaml`):
  ```yaml
  pricing:
    claude-sonnet-4-20250514:
      input_per_mtok: 3.00
      output_per_mtok: 15.00
      cache_read_per_mtok: 0.30
      cache_write_per_mtok: 3.75
    claude-opus-4-20250514:
      input_per_mtok: 15.00
      output_per_mtok: 75.00
      cache_read_per_mtok: 1.50
      cache_write_per_mtok: 18.75
  ```
- `GetCost(sessionID) (*CostSummary, error)` -- returns current totals + estimated USD
- `GetCostAcrossSessions() (*CostSummary, error)` -- aggregate across all active sessions
- Emit Wails event `session:cost-updated` with `{sessionID, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, estimatedCostUSD}` on every token update (debounced to max 2 updates/sec to avoid event flooding)
- Persist to `session_cost` table on every event (batch writes, flush every 5s or on session end)

**6.4.2** SQL migration -- `internal/db/migrations/00X_session_cost.up.sql`
```sql
CREATE TABLE session_cost (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id),
    model TEXT NOT NULL DEFAULT '',
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
    last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**6.4.3** sqlc queries -- `internal/db/queries/session_cost.sql`
- `UpsertSessionCost`, `GetSessionCost`, `GetTotalCost`, `GetCostByDateRange`
- `GetCostByModel` -- aggregate costs grouped by model name

---

### 6.5 -- Multi-Session Orchestration

Enable running sessions side-by-side and piping one session's output into another.

**6.5.1** `internal/session/orchestrator.go` -- Multi-session orchestrator
- `Orchestrator` struct: pipeline registry (`map[string]*Pipeline`), controller ref
- `CreatePipeline(config PipelineConfig) (*Pipeline, error)`:
  - `PipelineConfig`: source session ID, target session ID, trigger (on tool call completion / on session completion / on specific event type), transform function (optional: reformat output before piping), filter predicate (optional: only pipe certain events)
  - Example: Session A finishes a code review → pipe the review summary as input to Session B which implements the fixes
- `Pipeline` struct: ID, source, target, trigger, transform, filter, state (active/paused/completed), stats (events piped, bytes transferred)
- `PipeEvent(event StreamEvent)` -- called by the session controller's `OnEvent` hook. Checks if any pipeline's source matches. If trigger condition met, applies transform + filter, then injects into target session as a user message via Claude CLI stdin
- `ListPipelines() []*Pipeline`
- `PausePipeline(id) / ResumePipeline(id) / DeletePipeline(id)`

**6.5.2** `internal/session/orchestrator_templates.go` -- Pre-built orchestration templates
- `ReviewAndFix`: Session A = code review, Session B = implementation. A's findings pipe to B as instructions.
- `TestAndIterate`: Session A = write tests, Session B = implement until tests pass. B's failures pipe back to B (self-loop with test output).
- `ResearchAndSummarize`: Session A = research/explore, Session B = summarize findings. A's tool call results pipe to B.
- Templates are convenience wrappers around `CreatePipeline` with pre-configured transforms.

**6.5.3** `internal/app/bindings_orchestration.go` -- Wails bindings for orchestration
- `CreatePipeline(sourceID, targetID, triggerType, templateName) (string, error)`
- `ListPipelines() ([]PipelineInfo, error)`
- `PausePipeline(id) error` / `ResumePipeline(id) error` / `DeletePipeline(id) error`
- `GetPipelineStats(id) (*PipelineStats, error)`

---

### 6.6 -- Session Policies

Configurable per-session approval mode for tool calls.

**6.6.1** `internal/session/policy.go` -- Policy engine
- `PolicyMode` enum: `Supervised`, `AutoAccept`, `Smart`
- `Supervised`: every tool call requires explicit user approval (default for new sessions)
- `AutoAccept`: all tool calls auto-approved (user trusts Claude fully for this session)
- `Smart`: tool calls below a confidence threshold require approval; above threshold auto-approved
  - Confidence scoring: route the tool call + context through the AI engine's fast tier (Phase 4b)
  - `SmartPolicyConfig`: confidence threshold (default 0.8), excluded tools (always require approval, e.g., `Bash` with `rm`, `git push --force`), included tools (always auto-approve, e.g., `Read`, `Glob`)
- `PolicyEngine` struct: default policy, per-session overrides, AI engine ref, safety engine ref
- `EvaluateToolCall(session, toolCall) (PolicyDecision, error)`:
  1. Check safety rules first -- if safety engine returns `block`, policy is overridden to block regardless of mode
  2. If `Supervised` → return `RequiresApproval`
  3. If `AutoAccept` → return `Approved`
  4. If `Smart` → check excluded/included tool lists first, then call AI engine for confidence score, compare to threshold
- `PolicyDecision` struct: action (Approved / RequiresApproval / Blocked), reason, confidence score (if Smart mode), safety rule name (if blocked by safety)
- `SetPolicy(sessionID, mode, config) error` -- change policy mid-session
- `GetPolicy(sessionID) (*PolicyConfig, error)`

**6.6.2** Integration with stream parser (modify `internal/stream/parser.go` from Phase 3)
- When parser encounters a tool call event:
  1. Call `PolicyEngine.EvaluateToolCall`
  2. If `RequiresApproval` → emit Wails event `session:approval-required` with tool call details → frontend shows approval modal → wait for user response via Wails binding `ApproveToolCall(sessionID, toolCallID, approved)`
  3. If `Approved` → tool call proceeds (send approval to Claude CLI stdin)
  4. If `Blocked` → tool call rejected, send rejection to Claude CLI, emit `session:tool-blocked` event

**6.6.3** SQL migration -- `internal/db/migrations/00X_session_policies.up.sql`
```sql
CREATE TABLE session_policies (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id),
    mode TEXT NOT NULL DEFAULT 'supervised',
    confidence_threshold REAL DEFAULT 0.8,
    excluded_tools TEXT DEFAULT '[]', -- JSON array of tool names
    included_tools TEXT DEFAULT '[]', -- JSON array of tool names
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE policy_decisions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    tool_call_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    mode TEXT NOT NULL,
    action TEXT NOT NULL, -- approved, requires_approval, blocked
    confidence_score REAL,
    safety_rule TEXT,
    reason TEXT,
    user_response TEXT, -- approved, rejected, null if auto
    decided_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_policy_decisions_session ON policy_decisions(session_id);
```

**6.6.4** sqlc queries -- `internal/db/queries/session_policies.sql`
- `UpsertSessionPolicy`, `GetSessionPolicy`, `GetDefaultPolicy`
- `RecordPolicyDecision`, `ListDecisionsBySession`, `GetApprovalRate(sessionID)` -- percentage of auto-approved vs manual

---

### 6.7 -- Wails Bindings (Go → Solid.js bridge)

**6.7.1** `internal/app/bindings_sessions.go` -- Extend existing session bindings
- `PauseSession(id) error`
- `ResumeSession(id) error`
- `KillSession(id) error`
- `RestartSession(id) (string, error)` -- returns new session ID
- `BranchSession(id, label) (string, error)` -- returns branch session ID
- `ListBranches(id) ([]BranchInfo, error)`
- `SwitchBranch(branchID) error`
- `MergeBranch(branchID, targetID) error`
- `DeleteBranch(branchID) error`
- `RewindSession(id, targetEventIndex) (string, error)` -- returns rewound session ID
- `RewindByToolCalls(id, n) (string, error)`
- `GetRewindPoints(id) ([]RewindPoint, error)`
- `GetSessionCost(id) (*CostSummary, error)`
- `GetTotalCost() (*CostSummary, error)`
- `SetSessionPolicy(id, mode, config) error`
- `GetSessionPolicy(id) (*PolicyConfig, error)`
- `ApproveToolCall(sessionID, toolCallID, approved) error`
- `GetSessionTimeline(id) ([]TimelineEvent, error)`
- `GetBranchTree(id) (*BranchTree, error)` -- nested tree structure for `BranchSelector`

**6.7.2** `internal/app/events_sessions.go` -- Wails event emission
- Define all session event types emitted to frontend:
  - `session:state-changed` -- `{sessionID, oldState, newState}`
  - `session:paused` / `session:resumed`
  - `session:branched` -- `{parentID, branchID, label, forkPoint}`
  - `session:rewound` -- `{sessionID, newSessionID, targetEventIndex}`
  - `session:cost-updated` -- `{sessionID, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, estimatedCostUSD}`
  - `session:approval-required` -- `{sessionID, toolCallID, toolName, input, context}`
  - `session:tool-blocked` -- `{sessionID, toolCallID, ruleName, reason}`
  - `session:pipeline-event` -- `{pipelineID, sourceID, targetID, eventType}`

---

### 6.8 -- Solid.js Frontend Components

All components use Solid.js signals (no React patterns), Kobalte for accessible primitives, and Vanilla Extract for styling.

**6.8.1** `frontend/src/components/session/SessionDashboard.tsx`
- Displays all active sessions in a card grid layout
- Each session card shows:
  - Session name / ID (truncated)
  - Current state badge (Running = green pulse, Paused = amber, Branched = blue, Error = red)
  - Policy mode indicator (shield icon for Supervised, bolt icon for Auto, brain icon for Smart)
  - Token count: input / output / cache (compact format: "12.4k in / 8.1k out")
  - Estimated cost in USD (e.g., "$0.42")
  - Progress indicator: tool call count, files modified count
  - Time elapsed since session start
  - Quick actions: Pause/Resume button, Kill button (with confirm), Branch button, Policy toggle
- Uses `<For each={sessions()}>` for keyed rendering -- adding/removing sessions does not rerender existing cards
- Subscribes to Wails events: `session:state-changed`, `session:cost-updated`
- Virtualized list via `@tanstack/solid-virtual` if > 20 sessions (unlikely but safe)
- Responsive: 1-column on narrow panes, 2-3 columns on wider panes

**6.8.2** `frontend/src/components/session/PolicySwitcher.tsx`
- Per-session dropdown or segmented control to switch between Supervised / Auto-Accept / Smart
- When switching to Smart, shows a slider for confidence threshold (0.0 - 1.0, default 0.8)
- When switching to Auto-Accept, shows a confirmation dialog: "All tool calls will be auto-approved. Are you sure?"
- Tool exclusion list: multi-select of tool names that always require approval regardless of mode
- Calls `SetSessionPolicy` Wails binding on change
- Visual indicator changes immediately via signal (optimistic update, rollback on error)
- Keyboard accessible (Kobalte `Select` / `SegmentedControl`)

**6.8.3** `frontend/src/components/session/SessionTimeline.tsx`
- Vertical timeline of all session events, rendered chronologically
- Event types rendered differently:
  - Tool calls: icon + tool name + summary (collapsible to show full input/output)
  - Thinking blocks: brain icon + first line (collapsible)
  - Text output: message bubble
  - Cost checkpoints: dollar icon + running total at that point
  - State changes: badge (paused, resumed, branched)
  - Safety alerts: warning icon + rule name
  - Rewind markers: rewind icon + "Rewound to here" label
  - Branch points: fork icon + branch label
- Rewind interaction: clicking any tool call event shows a "Rewind to here" button. Clicking it calls `RewindSession`.
- Timeline scrubbing: a draggable handle on the left rail lets the user scrub through events. The Smart View on the right updates to show the session state at that point (read-only replay).
- Uses `<For each={timelineEvents()}>` with virtualization for long sessions (1000+ events)
- Subscribes to `session:cost-updated`, `session:state-changed`, stream events via WebSocket
- Animated entry for new events via `solid-motionone` (slide in from bottom)

**6.8.4** `frontend/src/components/session/BranchSelector.tsx`
- Tree visualization of session branches (similar to a git branch graph)
- Root session at the top, branches fork downward at their fork points
- Each branch node shows: label, state badge, token count, tool call count
- Click a branch to switch the main view to that branch session
- Right-click context menu (Kobalte `ContextMenu`): Merge, Delete, Rename, View Diff (compare branch files to parent)
- Active branch is highlighted with a glow effect
- Collapsed by default in the sidebar; expands on click
- Subscribes to `session:branched` Wails event to add new branch nodes in real-time

**6.8.5** `frontend/src/signals/sessions.ts` -- Extend existing session signals
- `createSessionStore()`:
  - `sessions: Signal<Session[]>` -- all active sessions
  - `selectedSessionId: Signal<string | null>`
  - `sessionCosts: Signal<Map<string, CostSummary>>`
  - `sessionPolicies: Signal<Map<string, PolicyConfig>>`
  - `branchTrees: Signal<Map<string, BranchTree>>`
  - `timelineEvents: Signal<Map<string, TimelineEvent[]>>`
  - `pendingApprovals: Signal<ApprovalRequest[]>` -- tool calls waiting for user decision
- Event subscriptions (set up in `onMount`):
  - `EventsOn('session:state-changed', ...)` → update session state in store
  - `EventsOn('session:cost-updated', ...)` → update cost map
  - `EventsOn('session:branched', ...)` → update branch tree
  - `EventsOn('session:approval-required', ...)` → add to pending approvals
  - `EventsOn('session:tool-blocked', ...)` → show toast notification

**6.8.6** `frontend/src/components/session/ApprovalModal.tsx` -- Tool call approval UI
- Modal that appears when `session:approval-required` fires (Smart or Supervised mode)
- Shows: tool name, tool input (syntax highlighted), session context (what Claude is trying to do)
- Buttons: Approve, Reject, Approve All (switches session to Auto-Accept for remaining calls)
- Keyboard shortcuts: Enter = Approve, Escape = Reject
- Auto-dismiss after 30s if session policy is Smart and confidence > 0.95 (configurable)
- Stacks if multiple approvals pending (shows count badge, processes in order)

**6.8.7** `frontend/src/styles/session.css.ts` -- Vanilla Extract styles
- Session card recipe with variants for each state (Running, Paused, Branched, etc.)
- Timeline event styles with left rail, connector lines, and event type icons
- Branch tree SVG path styles for connector lines
- Policy switcher segment styles
- Solo Leveling theme integration: glow effects on active sessions, particle effects on branch creation
- Responsive breakpoints for session dashboard grid

---

### 6.9 -- Testing

**6.9.1** Go unit tests (table-driven)
- `internal/session/controller_test.go`:
  - Start/Pause/Resume lifecycle
  - Kill cancels context and cleans up goroutines
  - Restart produces new session with link to previous
  - Concurrent access: 10 goroutines calling Pause/Resume simultaneously
- `internal/session/branch_test.go`:
  - Branch creates snapshot and new session
  - Branch tree query returns correct hierarchy
  - Merge applies file diffs correctly
  - Delete branch performs soft delete
  - Branching a branch (nested branches) works
- `internal/session/rewind_test.go`:
  - Rewind to specific event index
  - RewindByToolCalls calculates correct target
  - Rewind past file deletions restores files
  - Rewind creates implicit branch for undo
- `internal/session/cost_test.go`:
  - Token extraction from stream-json events
  - USD calculation with pricing table
  - Aggregate cost across sessions
  - Debounced event emission (max 2/sec)
- `internal/session/policy_test.go`:
  - Supervised mode always requires approval
  - Auto-accept mode always approves
  - Smart mode calls AI engine and respects threshold
  - Safety rules override policy (block trumps auto-accept)
  - Excluded tools always require approval in Smart mode
- `internal/session/orchestrator_test.go`:
  - Pipeline creation and event routing
  - Transform function applied correctly
  - Filter predicate excludes non-matching events
  - Pipeline pause/resume
  - Template instantiation

**6.9.2** Solid.js component tests (`vitest` + `@solidjs/testing-library`)
- `SessionDashboard.test.tsx`: renders session cards, updates on state change event, responsive layout
- `PolicySwitcher.test.tsx`: mode switch calls binding, confirmation dialog on Auto-Accept, threshold slider
- `SessionTimeline.test.tsx`: renders events chronologically, rewind button calls binding, virtualization for large lists
- `BranchSelector.test.tsx`: tree rendering, click switches branch, context menu actions
- `ApprovalModal.test.tsx`: keyboard shortcuts, auto-dismiss, approval/rejection calls binding

**6.9.3** Integration tests
- Full lifecycle: Start → Pause → Branch → Resume both → Kill original → Branch continues
- Rewind + Branch: Rewind creates implicit branch, original branch accessible
- Pipeline: Session A output piped to Session B, transform applied
- Policy + Safety: Smart mode auto-approves safe call, blocks when safety rule triggers
- Cost tracking end-to-end: stream-json with token data → cost updated → persisted to DB → frontend signal updated

---

### 6.10 -- Documentation and Config

**6.10.1** Update `~/.phantom-os/config.yaml` schema with session controller defaults:
```yaml
session:
  default_policy: supervised
  smart_policy:
    confidence_threshold: 0.8
    excluded_tools: ["Bash"]
    included_tools: ["Read", "Glob", "Grep"]
  cost_tracking:
    enabled: true
    emit_interval_ms: 500
    persist_interval_s: 5
  branching:
    max_branches_per_session: 10
    auto_snapshot_on_branch: true
  rewind:
    max_rewind_points: 100
    warn_on_commit_rewind: true
  orchestration:
    max_pipelines: 5
    max_pipeline_depth: 3 # prevent infinite loops
```

**6.10.2** Update `internal/app/bindings_sessions.go` JSDoc comments for Wails TS type generation -- each binding method gets a clear description so the auto-generated TypeScript types are self-documenting.

---

## Acceptance Criteria

1. **Pause/Resume**: User can pause a running session. PTY output buffers silently. Claude CLI process stops (SIGTSTP). Resume flushes buffer and continues. No data loss.
2. **Branching**: User can branch any session. Both sessions run independently. Branch tree is queryable and rendered in BranchSelector. Merge applies file-level diffs. Nested branching (branch of a branch) works up to `max_branches_per_session` depth.
3. **Rewinding**: User can rewind to any past tool call. Working directory reverts to that point. Rewound session continues from the rewind point. An implicit branch preserves the un-rewound state.
4. **Cost tracking**: Token counts (input, output, cache read, cache write) parsed from stream-json in real-time. USD estimates computed per model. Aggregated across sessions. Persisted to SQLite. Frontend updates within 500ms of token event.
5. **Multi-session orchestration**: User can create a pipeline between two sessions. Output from source session is piped to target session based on trigger + filter + transform. At least 3 pre-built templates work out of the box.
6. **Kill/Restart**: Kill terminates the session goroutine, sends SIGHUP to PTY, persists final state. Restart kills and creates a new session with the same config. No goroutine leaks (verified by test).
7. **Session policies**: Supervised mode prompts for every tool call. Auto-accept skips all prompts. Smart mode uses AI engine confidence scoring with configurable threshold. Safety rules override policy in all modes. Policy can be changed mid-session.
8. **SessionDashboard**: Renders all active sessions with real-time status, token counts, costs, and quick actions. Cards update reactively (no full re-render).
9. **PolicySwitcher**: Per-session policy toggle with confirmation for Auto-Accept, threshold slider for Smart mode, and tool exclusion multi-select.
10. **SessionTimeline**: Chronological event timeline with rewind markers, branch points, cost checkpoints. Rewind-to-here interaction works. Virtualized for 1000+ events.
11. **BranchSelector**: Tree visualization of branches with switch, merge, delete, rename. Real-time updates on branch creation.
12. **All tests pass**: >80% coverage on `internal/session/` package. All Solid.js component tests pass. Integration tests cover cross-feature interactions.
13. **No goroutine leaks**: Every session goroutine exits cleanly on Kill, context cancellation, or app shutdown. Verified with `runtime.NumGoroutine()` checks in tests.
14. **Performance**: Pause/Resume latency < 50ms. Branch creation < 2s (dominated by Claude CLI startup). Cost event processing < 5ms. Timeline rendering with 1000 events scrolls at 60fps (virtualized).

---

## Estimated Effort

| Sub-phase | Effort | Notes |
|---|---|---|
| 6.1 Session Lifecycle Foundation | 3-4 days | Core controller, goroutine loop, pause/resume |
| 6.2 Session Branching | 4-5 days | Snapshot serialization, Claude CLI replay, merge logic |
| 6.3 Session Rewinding | 3-4 days | Reverse-diff computation, working directory restoration |
| 6.4 Cost Tracking | 1-2 days | Token parsing exists in Phase 3; this extends and persists it |
| 6.5 Multi-Session Orchestration | 3-4 days | Pipeline engine, templates, stdin injection |
| 6.6 Session Policies | 3-4 days | Policy engine, AI engine integration, safety override logic |
| 6.7 Wails Bindings | 1-2 days | Thin wrappers over controller methods |
| 6.8 Solid.js Components | 5-7 days | 5 components + signals + styles + accessibility |
| 6.9 Testing | 3-4 days | Unit, component, integration |
| 6.10 Config + Docs | 1 day | Config schema, JSDoc |
| **Total** | **27-37 days (~5-7 weeks)** | Single developer, sequential. Parallel work on Go + Solid.js could compress to 4-5 weeks. |

### Risk Factors

- **Claude CLI `--resume` behavior**: Branch/rewind depends on being able to replay a conversation from JSONL. If Claude CLI does not support this cleanly, a workaround (re-injecting messages via stdin) adds 2-3 days.
- **SIGTSTP to Claude process group**: If Claude CLI does not handle SIGTSTP gracefully (e.g., it corrupts its own state), pause/resume must fall back to buffering only (no actual process suspension). Add 1 day for fallback path.
- **Smart policy latency**: AI engine confidence scoring must be fast (< 50ms) to avoid blocking tool calls. If the AI engine is slower, Smart mode degrades to a fire-and-notify pattern (auto-approve, then flag low-confidence calls for review). This is an acceptable degradation.

---

## Author

**Subash Karki** -- 2026-04-18
