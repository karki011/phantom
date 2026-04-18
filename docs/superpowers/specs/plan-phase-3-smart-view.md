# Phase 3: Stream Parser + Smart View

**Author:** Subash Karki
**Date:** 2026-04-18
**Status:** Draft
**Parent spec:** `2026-04-18-phantomos-v2-design.md`
**Dependencies:** Phase 1 (terminal manager, SQLite, session collectors)
**Estimated effort:** 3-4 weeks (1 developer)

---

## Goal

Build a real-time Claude stream-json parser in Go and a Solid.js Smart View UI that transforms raw Claude CLI output into a structured, interactive session viewer. Users toggle between Smart View (parsed cards, diffs, cost tracking) and Raw Terminal (full xterm.js PTY) for any session -- both powered by the same underlying PTY.

This is the feature that makes PhantomOS more than a terminal wrapper. Without it, users see raw JSON noise. With it, they see tool calls as collapsible cards, file edits as syntax-highlighted diffs, thinking as expandable blocks, and costs updating in real-time.

---

## Prerequisites

From Phase 1 (must be complete):
- `internal/terminal/manager.go` -- PTY lifecycle with `creack/pty`
- `internal/terminal/session.go` -- per-session goroutine with `context.Context`
- `internal/db/sqlite.go` -- WAL-mode SQLite connection via `modernc.org/sqlite`
- `internal/db/migrations/` -- migration runner via `golang-migrate/migrate`
- `internal/collector/jsonl_scanner.go` -- JSONL session discovery (filesystem-based)
- `frontend/src/signals/sessions.ts` -- Solid signal for active sessions
- Wails event bus operational (Go -> Solid push)

From Phase 0 (must be complete):
- Wails v2 shell with Solid.js + Vite rendering
- WebSocket server bootstrapped (even if unused until this phase)

---

## Tasks

### Part A: Go Stream Parser (Week 1)

#### A1. Define typed event structs
**File:** `internal/stream/events.go`

Define Go structs for every Claude stream-json event type. These are the canonical types that flow through the entire system.

```go
type EventType string

const (
    EventText      EventType = "text"
    EventThinking  EventType = "thinking"
    EventToolCall  EventType = "tool_call"
    EventToolResult EventType = "tool_result"
    EventError     EventType = "error"
    EventCost      EventType = "cost"
    EventSystem    EventType = "system"
)

type StreamEvent struct {
    ID        string          `json:"id"`
    SessionID string          `json:"session_id"`
    Type      EventType       `json:"type"`
    Timestamp time.Time       `json:"timestamp"`
    Payload   json.RawMessage `json:"payload"`
}

// Typed payloads
type TextPayload struct {
    Content string `json:"content"`
}

type ThinkingPayload struct {
    Content string `json:"content"`
}

type ToolCallPayload struct {
    ToolName  string          `json:"tool_name"`  // Read, Edit, Bash, Write, Glob, Grep, etc.
    ToolID    string          `json:"tool_id"`
    Input     json.RawMessage `json:"input"`
    Status    string          `json:"status"`      // "pending", "running", "complete", "error"
    Duration  time.Duration   `json:"duration_ms"`
}

type ToolResultPayload struct {
    ToolID   string `json:"tool_id"`
    Output   string `json:"output"`
    IsError  bool   `json:"is_error"`
    ExitCode *int   `json:"exit_code,omitempty"` // Bash only
}

type ErrorPayload struct {
    Message string `json:"message"`
    Code    string `json:"code,omitempty"`
}

type CostPayload struct {
    InputTokens      int    `json:"input_tokens"`
    OutputTokens     int    `json:"output_tokens"`
    CacheReadTokens  int    `json:"cache_read_tokens"`
    CacheWriteTokens int    `json:"cache_write_tokens"`
    Model            string `json:"model"`
    // Computed fields
    CostUSD          float64 `json:"cost_usd"`
    CumulativeCostUSD float64 `json:"cumulative_cost_usd"`
}

type SystemPayload struct {
    Message string `json:"message"`
    Phase   string `json:"phase"` // "init", "ready", "shutdown"
}
```

Reference v1 `TokenAccumulator` from `packages/server/src/collectors/jsonl-scanner.ts` for field parity.

#### A2. Implement the stream parser goroutine
**File:** `internal/stream/parser.go`

One goroutine per Claude session. Reads from the PTY's output stream (tee'd -- same bytes also go to xterm.js), detects `stream-json` framing, and emits typed `StreamEvent` values on a channel.

```go
type Parser struct {
    sessionID string
    input     io.Reader       // tee'd from PTY output
    events    chan StreamEvent // output channel
    cancel    context.CancelFunc
    cost      *CostAccumulator
}

func NewParser(sessionID string, input io.Reader) *Parser
func (p *Parser) Run(ctx context.Context) error  // blocking -- run in goroutine
func (p *Parser) Events() <-chan StreamEvent
func (p *Parser) Close()
```

Key implementation details:
- Use `bufio.Scanner` with a custom split function that detects stream-json message boundaries (newline-delimited JSON).
- Claude CLI `--output-format stream-json` emits one JSON object per line. Each has a `type` field.
- Parse with `encoding/json` -- unmarshal to `map[string]interface{}` first, then switch on `type` to unmarshal payload into typed struct.
- Maintain a `CostAccumulator` (goroutine-local, no mutex needed) that tracks running token totals.
- Emit a `CostPayload` event after every assistant message that includes token usage.
- Handle partial lines (stream may chunk mid-JSON) -- buffer until newline.
- On parse error: emit an `EventError` event with the raw line, do NOT crash the goroutine.

#### A3. Implement the cost accumulator
**File:** `internal/stream/cost.go`

Port from v1 `TokenAccumulator` in `packages/server/src/collectors/jsonl-scanner.ts`.

```go
type CostAccumulator struct {
    InputTokens      int
    OutputTokens     int
    CacheReadTokens  int
    CacheWriteTokens int
    MessageCount     int
    ToolUseCount     int
    ToolBreakdown    map[string]int // tool_name -> count
    Model            string
    StartedAt        time.Time
    LastUpdated      time.Time
}

func (c *CostAccumulator) Update(event StreamEvent)
func (c *CostAccumulator) ComputeCostUSD() float64  // model-aware pricing
func (c *CostAccumulator) Snapshot() CostPayload
```

Model pricing table: port `getModelPricing()` from `@phantom-os/shared`. Support claude-opus-4-20250918, claude-sonnet-4-20250514, haiku at minimum.

#### A4. Wire parser into terminal session lifecycle
**File:** `internal/terminal/session.go` (modify)

When a terminal session runs Claude with `--output-format stream-json`:
1. Detect the `stream-json` flag in the command (inspect PTY input).
2. Create an `io.TeeReader` that splits PTY output to: (a) the raw WebSocket channel (for xterm.js), and (b) the stream parser input.
3. Start the parser goroutine with the session's `context.Context`.
4. When the session ends (context cancelled), the parser goroutine exits cleanly.

For externally-discovered sessions (from Phase 1 collectors): the JSONL scanner already produces parsed data. Add an adapter that converts collector output into `StreamEvent` structs for UI consistency.

**File:** `internal/collector/event_adapter.go` (new)

```go
// Converts JSONL scanner output to StreamEvent for UI consumption
func AdaptJSONLEntry(sessionID string, entry map[string]interface{}) (StreamEvent, error)
```

---

### Part B: WebSocket Hub (Week 1-2)

#### B1. Implement the WebSocket broadcast hub
**File:** `internal/stream/hub.go`

Multiplexed WebSocket hub using `nhooyr.io/websocket`. Single WebSocket connection per app, messages tagged with session ID.

```go
type Hub struct {
    mu          sync.RWMutex
    subscribers map[string]map[*Subscriber]struct{} // sessionID -> subscribers
    broadcast   chan HubMessage
}

type HubMessage struct {
    SessionID string      `json:"session_id"`
    Event     StreamEvent `json:"event"`
}

type Subscriber struct {
    conn   *websocket.Conn
    send   chan []byte
    filter []string // session IDs this subscriber cares about
}

func NewHub() *Hub
func (h *Hub) Run(ctx context.Context)                         // main broadcast loop
func (h *Hub) Subscribe(ctx context.Context, conn *websocket.Conn, sessionIDs []string) *Subscriber
func (h *Hub) Unsubscribe(sub *Subscriber)
func (h *Hub) Publish(sessionID string, event StreamEvent)     // called by parser goroutines
func (h *Hub) AddSessionFilter(sub *Subscriber, sessionID string)
func (h *Hub) RemoveSessionFilter(sub *Subscriber, sessionID string)
```

Key details:
- Single goroutine runs the broadcast loop (select on `broadcast` channel).
- Subscribers have a buffered `send` channel (capacity 256). If a subscriber falls behind, drop oldest events (not newest) and emit a `gap` event so the UI knows to refetch.
- WebSocket messages are JSON-encoded `HubMessage` with `session_id` for client-side demuxing.
- Subscriber can dynamically add/remove session ID filters (e.g., user switches which session they are viewing).
- Ping/pong keepalive every 30 seconds via `nhooyr.io/websocket` built-in mechanism.

#### B2. WebSocket HTTP handler
**File:** `internal/stream/ws_handler.go`

```go
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request)
```

Upgrade handler that accepts WebSocket connections, reads initial `subscribe` message with session IDs, and registers the subscriber with the hub.

Wire into Wails: start an `http.Server` on `localhost:0` (random port), pass the port to the frontend via a Wails binding. The frontend connects `ws://localhost:{port}/ws`.

#### B3. Frontend WebSocket client
**File:** `frontend/src/wails/ws-client.ts`

```typescript
interface WSMessage {
  session_id: string;
  event: StreamEvent;
}

export function createWSClient(port: number) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);

  function subscribe(sessionIds: string[]): void;
  function onEvent(handler: (msg: WSMessage) => void): () => void;
  function close(): void;

  return { subscribe, onEvent, close };
}
```

---

### Part C: SQLite Persistence (Week 2)

#### C1. Create session_events migration
**File:** `internal/db/migrations/003_session_events.up.sql`

```sql
CREATE TABLE IF NOT EXISTS session_events (
    id          TEXT PRIMARY KEY,       -- UUID
    session_id  TEXT NOT NULL,
    type        TEXT NOT NULL,          -- text, thinking, tool_call, tool_result, error, cost, system
    timestamp   INTEGER NOT NULL,       -- Unix ms
    payload     TEXT NOT NULL,          -- JSON blob
    -- Denormalized for fast queries
    tool_name   TEXT,                   -- NULL unless type=tool_call
    is_error    INTEGER DEFAULT 0,      -- 1 if error event or failed tool
    cost_usd    REAL DEFAULT 0,         -- cumulative at this point
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_session_events_session_id ON session_events(session_id);
CREATE INDEX idx_session_events_type ON session_events(type);
CREATE INDEX idx_session_events_session_ts ON session_events(session_id, timestamp);
CREATE INDEX idx_session_events_tool_name ON session_events(tool_name) WHERE tool_name IS NOT NULL;
```

**File:** `internal/db/migrations/003_session_events.down.sql`

```sql
DROP TABLE IF EXISTS session_events;
```

#### C2. Write sqlc queries for session events
**File:** `internal/db/queries/session_events.sql`

```sql
-- name: InsertSessionEvent :exec
INSERT INTO session_events (id, session_id, type, timestamp, payload, tool_name, is_error, cost_usd)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);

-- name: GetSessionEvents :many
SELECT * FROM session_events
WHERE session_id = ?
ORDER BY timestamp ASC;

-- name: GetSessionEventsByType :many
SELECT * FROM session_events
WHERE session_id = ? AND type = ?
ORDER BY timestamp ASC;

-- name: GetSessionToolCalls :many
SELECT * FROM session_events
WHERE session_id = ? AND type = 'tool_call'
ORDER BY timestamp ASC;

-- name: GetSessionErrors :many
SELECT * FROM session_events
WHERE session_id = ? AND is_error = 1
ORDER BY timestamp ASC;

-- name: GetSessionCost :one
SELECT cost_usd FROM session_events
WHERE session_id = ? AND type = 'cost'
ORDER BY timestamp DESC
LIMIT 1;

-- name: SearchSessionEvents :many
SELECT * FROM session_events
WHERE session_id = ? AND payload LIKE ?
ORDER BY timestamp ASC
LIMIT ?;

-- name: DeleteSessionEvents :exec
DELETE FROM session_events WHERE session_id = ?;

-- name: GetSessionEventCount :one
SELECT COUNT(*) FROM session_events WHERE session_id = ?;
```

Run `sqlc generate` to produce type-safe Go code.

#### C3. Event persistence writer
**File:** `internal/stream/persister.go`

Goroutine that consumes from the parser's event channel and batch-writes to SQLite.

```go
type Persister struct {
    db     *sql.DB
    events <-chan StreamEvent
    batch  []StreamEvent
    ticker *time.Ticker  // flush every 500ms
}

func NewPersister(db *sql.DB, events <-chan StreamEvent) *Persister
func (p *Persister) Run(ctx context.Context) error
func (p *Persister) flush() error
```

Batch inserts (up to 50 events per batch) within a single transaction for write performance. Flush on timer tick (500ms) or when batch is full, whichever comes first.

---

### Part D: Smart View Solid.js Components (Week 2-3)

#### D1. Session event signal store
**File:** `frontend/src/signals/session-events.ts`

```typescript
import { createSignal, createMemo } from 'solid-js';
import type { StreamEvent, ToolCallPayload, CostPayload } from '../types/events';

// Per-session event store
export function createSessionEventStore(sessionId: string) {
  const [events, setEvents] = createSignal<StreamEvent[]>([]);
  const [viewMode, setViewMode] = createSignal<'smart' | 'raw'>('smart');

  // Append new events (from WebSocket) -- Solid only updates the new DOM nodes
  const appendEvent = (event: StreamEvent) => {
    setEvents(prev => [...prev, event]);
  };

  // Derived signals
  const toolCalls = createMemo(() =>
    events().filter(e => e.type === 'tool_call')
  );
  const errors = createMemo(() =>
    events().filter(e => e.type === 'error')
  );
  const latestCost = createMemo(() => {
    const costEvents = events().filter(e => e.type === 'cost');
    return costEvents.length > 0 ? costEvents[costEvents.length - 1].payload as CostPayload : null;
  });

  return { events, appendEvent, viewMode, setViewMode, toolCalls, errors, latestCost };
}
```

#### D2. SessionStream.tsx -- event list container
**File:** `frontend/src/components/smart-view/SessionStream.tsx`

The top-level Smart View component. Uses Solid's `<For>` for keyed list rendering -- only new events cause DOM insertions, existing events are never touched.

```typescript
import { For, Show, Switch, Match } from 'solid-js';
import { ToolCallCard } from './ToolCallCard';
import { ThinkingBlock } from './ThinkingBlock';
import { TextBlock } from './TextBlock';
import { CostTracker } from './CostTracker';
import { TestResults } from './TestResults';
import { ImagePreview } from './ImagePreview';
import { FileLink } from './FileLink';

interface SessionStreamProps {
  sessionId: string;
}

export function SessionStream(props: SessionStreamProps) {
  const store = createSessionEventStore(props.sessionId);

  // Auto-scroll to bottom on new events
  let containerRef: HTMLDivElement | undefined;

  // Register WebSocket event listener
  onMount(() => {
    const unsub = wsClient.onEvent((msg) => {
      if (msg.session_id === props.sessionId) {
        store.appendEvent(msg.event);
        // Auto-scroll if user is near bottom
        if (containerRef && isNearBottom(containerRef)) {
          containerRef.scrollTop = containerRef.scrollHeight;
        }
      }
    });
    onCleanup(unsub);
  });

  return (
    <div ref={containerRef} class={styles.streamContainer}>
      <CostTracker cost={store.latestCost} />
      <For each={store.events()}>
        {(event) => (
          <Switch fallback={<TextBlock event={event} />}>
            <Match when={event.type === 'tool_call'}>
              <ToolCallCard event={event} />
            </Match>
            <Match when={event.type === 'thinking'}>
              <ThinkingBlock event={event} />
            </Match>
            <Match when={event.type === 'error'}>
              <ErrorBlock event={event} />
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
}
```

Use `@tanstack/solid-virtual` for virtualized scrolling when event count exceeds 500.

#### D3. ToolCallCard.tsx -- collapsible tool call cards
**File:** `frontend/src/components/smart-view/ToolCallCard.tsx`

Renders each tool call as a collapsible card with tool-specific rendering.

- **Read** -- show file path as a `<FileLink>`, line count badge
- **Edit** -- show `<DiffViewer>` with old_string/new_string
- **Bash** -- show command in monospace, output in scrollable pre, exit code badge
- **Write** -- show file path, content preview (collapsible)
- **Glob/Grep** -- show pattern, matched file list
- **WebFetch** -- show URL, response preview

Use Kobalte `<Collapsible>` for expand/collapse. Default state: collapsed for Read/Glob/Grep, expanded for Edit/Bash.

Show status indicator: spinner (running), green check (success), red X (error).
Show duration badge when complete.

#### D4. DiffViewer.tsx -- syntax-highlighted diffs
**File:** `frontend/src/components/smart-view/DiffViewer.tsx`

Renders file edits from `Edit` tool calls as syntax-highlighted diffs.

Two modes:
- **Unified diff** (default) -- single column, red/green lines
- **Side-by-side** -- two columns, old on left, new on right

Implementation approach:
- Parse `old_string` and `new_string` from the Edit tool input.
- Use a lightweight diff library (e.g., `diff` npm package) to compute the line-level diff.
- Apply syntax highlighting with a lightweight highlighter (Shiki or Prism.js -- NOT Monaco for inline diffs, too heavy).
- Detect language from the file path extension (port `detectLanguage` from v1 `DiffPane.tsx`).
- Accept/Reject buttons for supervised mode (Phase 5 integration point).

```typescript
interface DiffViewerProps {
  filePath: string;
  oldString: string;
  newString: string;
  mode?: 'unified' | 'side-by-side';
}
```

#### D5. ThinkingBlock.tsx -- expandable thinking sections
**File:** `frontend/src/components/smart-view/ThinkingBlock.tsx`

Renders Claude's `<thinking>` blocks as expandable sections. Default state: collapsed (thinking is verbose). Shows a summary line (first ~80 chars) when collapsed.

Use Kobalte `<Collapsible>` with smooth height animation via `solid-motionone`.

Render thinking content as markdown (use a lightweight markdown renderer, not full MDX).

#### D6. TestResults.tsx -- pass/fail badges
**File:** `frontend/src/components/smart-view/TestResults.tsx`

Parses Bash tool output for test runner patterns (vitest, jest, pytest, go test, cargo test). Extracts:
- Total tests, passed, failed, skipped
- Individual test names with pass/fail status
- Duration

Renders as a compact badge row: `12 passed | 2 failed | 1 skipped (3.2s)`

Failed tests expand to show error output. Pattern matching regexes:

```typescript
const patterns = {
  vitest: /Tests\s+(\d+)\s+passed.*?(\d+)\s+failed/,
  jest:   /Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/,
  pytest: /(\d+)\s+passed,?\s*(\d+)?\s*failed/,
  gotest: /^(ok|FAIL)\s+(\S+)\s+([\d.]+)s/m,
  cargo:  /test result: (\w+)\. (\d+) passed; (\d+) failed/,
};
```

#### D7. CostTracker.tsx -- real-time token counter
**File:** `frontend/src/components/smart-view/CostTracker.tsx`

Sticky header (or floating badge) showing real-time session cost.

Displays:
- Input tokens / Output tokens
- Cache read / write tokens
- Model name
- Estimated cost in USD (computed from model pricing)
- Session duration

Updates reactively via Solid signal -- only the specific number DOM nodes update, not the entire component.

```typescript
interface CostTrackerProps {
  cost: Accessor<CostPayload | null>;
}
```

#### D8. ImagePreview.tsx -- inline image rendering
**File:** `frontend/src/components/smart-view/ImagePreview.tsx`

When Claude reads an image file (via Read tool on a .png/.jpg/.gif/.svg/.webp), render it inline in the Smart View.

- Detect image file extensions in Read tool calls.
- For local files: use `file://` protocol or Wails asset serving.
- Constrain max dimensions (max-width: 100%, max-height: 400px).
- Click to expand to full size in a Kobalte `<Dialog>`.
- Show file path, dimensions, file size as metadata.

#### D9. FileLink.tsx -- clickable file paths
**File:** `frontend/src/components/smart-view/FileLink.tsx`

Renders file paths as clickable links that open in the editor pane.

```typescript
interface FileLinkProps {
  path: string;
  line?: number;
  worktreeId?: string;
}
```

- Click handler: call Wails binding to open file in editor pane (Monaco).
- If `line` is provided, scroll to that line.
- Show file icon based on extension (use a small icon set, not a full icon theme).
- Hover tooltip shows full absolute path.
- Right-click context menu: "Open in Editor", "Open in Finder", "Copy Path".

---

### Part E: Raw Terminal Toggle (Week 3)

#### E1. View mode toggle
**File:** `frontend/src/components/smart-view/ViewToggle.tsx`

Toggle button in the session pane header: Smart View | Raw Terminal.

Both views are always mounted (no destroy/recreate). The inactive view is hidden with `display: none` to preserve state. The xterm.js terminal keeps its scroll position and buffer. The Smart View keeps its event list and scroll position.

```typescript
export function ViewToggle(props: { mode: Accessor<'smart' | 'raw'>; onToggle: () => void }) {
  return (
    <div class={styles.toggleContainer}>
      <button
        classList={{ [styles.active]: props.mode() === 'smart' }}
        onClick={props.onToggle}
      >
        Smart View
      </button>
      <button
        classList={{ [styles.active]: props.mode() === 'raw' }}
        onClick={props.onToggle}
      >
        Raw Terminal
      </button>
    </div>
  );
}
```

Keyboard shortcut: `Cmd+Shift+V` toggles between views.

---

### Part F: Session History Search (Week 3-4)

#### F1. Search API (Go)
**File:** `internal/app/bindings_sessions.go` (modify)

Add Wails bindings for session event search:

```go
func (a *App) SearchSessionEvents(sessionID string, query string, filters SearchFilters) ([]StreamEvent, error)

type SearchFilters struct {
    Types     []EventType `json:"types"`      // filter by event type
    ToolNames []string    `json:"tool_names"` // filter by tool name
    HasError  *bool       `json:"has_error"`  // only errors
    After     *int64      `json:"after"`      // timestamp range
    Before    *int64      `json:"before"`
    Limit     int         `json:"limit"`
}
```

Uses the sqlc-generated queries from C2. Full-text search on `payload` column using SQLite `LIKE` (sufficient for v2.0 -- upgrade to FTS5 in v2.x if performance demands it).

#### F2. Search UI component
**File:** `frontend/src/components/smart-view/SessionSearch.tsx`

Search bar with structured filters:

- Text input for free-text search across event payloads.
- Filter chips: tool type (Read, Edit, Bash, etc.), event type (thinking, error, tool_call), errors only.
- Date/time range picker (for historical sessions).
- Results rendered as a filtered event list (reuses the same `<For>` rendering from SessionStream).
- Keyboard shortcut: `Cmd+F` within a session pane opens the search bar.

---

### Part G: Shared Types + Event Registry (Week 1, parallel)

#### G1. TypeScript event types (mirroring Go structs)
**File:** `frontend/src/types/events.ts`

```typescript
export type EventType = 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'cost' | 'system';

export interface StreamEvent {
  id: string;
  session_id: string;
  type: EventType;
  timestamp: number; // Unix ms
  payload: unknown;
}

export interface TextPayload {
  content: string;
}

export interface ThinkingPayload {
  content: string;
}

export interface ToolCallPayload {
  tool_name: string;
  tool_id: string;
  input: unknown;
  status: 'pending' | 'running' | 'complete' | 'error';
  duration_ms: number;
}

export interface ToolResultPayload {
  tool_id: string;
  output: string;
  is_error: boolean;
  exit_code?: number;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

export interface CostPayload {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  model: string;
  cost_usd: number;
  cumulative_cost_usd: number;
}

export interface SystemPayload {
  message: string;
  phase: 'init' | 'ready' | 'shutdown';
}
```

Consider using `typeshare` or Wails auto-generation to keep Go and TS types in sync. For v2.0, manual sync is acceptable given the small surface area.

#### G2. Component renderer registry
**File:** `frontend/src/components/smart-view/registry.ts`

```typescript
import type { Component } from 'solid-js';
import type { StreamEvent } from '../../types/events';

type EventRenderer = Component<{ event: StreamEvent }>;

const registry = new Map<string, EventRenderer>();

export function registerRenderer(eventType: string, component: EventRenderer): void {
  registry.set(eventType, component);
}

export function getRenderer(eventType: string): EventRenderer | undefined {
  return registry.get(eventType);
}

// Register defaults
registerRenderer('tool_call', ToolCallCard);
registerRenderer('thinking', ThinkingBlock);
registerRenderer('text', TextBlock);
registerRenderer('error', ErrorBlock);
registerRenderer('cost', CostTracker);
```

This registry is the extension point for Phase 6+ custom event renderers (e.g., `custom:deploy` -> `DeployStatusCard`).

---

### Part H: Vanilla Extract Styles (Week 2-3, parallel)

#### H1. Smart View design tokens
**File:** `frontend/src/styles/smart-view.css.ts`

Define compile-time CSS for all Smart View components using Vanilla Extract.

Key tokens:
- Card background, border, border-radius for tool call cards
- Syntax highlighting colors for diff viewer (match Solo Leveling dark theme)
- Status colors: success (green), error (red), warning (amber), info (blue), pending (gray)
- Thinking block muted styling (lower opacity, italic)
- Cost tracker accent color (gold/amber for USD amounts)
- Transition durations for collapsible animations

All values reference the global theme from `frontend/src/styles/theme.css.ts` (Phase 0).

---

## Data Flow Summary

```
PTY spawned by PhantomOS:
  Claude CLI --output-format stream-json
    │
    ├──→ io.TeeReader ──→ Raw bytes ──→ WebSocket ──→ xterm.js (Raw Terminal)
    │
    └──→ stream.Parser goroutine
           │
           ├──→ StreamEvent channel
           │      │
           │      ├──→ stream.Hub.Publish() ──→ WebSocket ──→ Solid signals ──→ Smart View
           │      │
           │      ├──→ stream.Persister ──→ SQLite session_events table
           │      │
           │      └──→ [Phase 5] Safety Rules Engine
           │
           └──→ CostAccumulator (local to parser goroutine)

Externally-discovered session (iTerm, VS Code):
  collector.JSONLScanner
    │
    └──→ collector.EventAdapter ──→ StreamEvent ──→ same Hub/Persister/UI pipeline
```

---

## Acceptance Criteria

### Parser (Go)
- [ ] Parser correctly handles all Claude stream-json event types (text, thinking, tool_use, tool_result, error, result with usage)
- [ ] Parser goroutine exits cleanly when session context is cancelled
- [ ] Malformed JSON lines emit an error event, do not crash the parser
- [ ] CostAccumulator produces accurate cumulative token counts matching v1 jsonl-scanner output
- [ ] Cost in USD is computed correctly for claude-opus-4-20250918, claude-sonnet-4-20250514, and haiku models
- [ ] Parser handles partial lines (mid-JSON chunk boundaries) without data loss

### WebSocket Hub
- [ ] Single WebSocket connection supports multiple session subscriptions
- [ ] Client can dynamically subscribe/unsubscribe to session IDs
- [ ] Events are delivered to correct subscribers based on session ID filter
- [ ] Slow subscriber receives gap event when buffer overflows (not a crash)
- [ ] WebSocket reconnects automatically on disconnect (client-side)
- [ ] Ping/pong keepalive prevents idle timeouts

### SQLite Persistence
- [ ] All events written to session_events table with correct schema
- [ ] Batch inserts maintain ordering (timestamp monotonic within session)
- [ ] Session history loads correctly after app restart
- [ ] Event search returns results matching text query and filters
- [ ] CASCADE delete on session removal also removes events

### Smart View Components
- [ ] SessionStream renders new events without re-rendering existing events (verify with Solid devtools)
- [ ] ToolCallCard correctly identifies and renders all tool types (Read, Edit, Bash, Write, Glob, Grep)
- [ ] DiffViewer shows accurate syntax-highlighted diffs for Edit tool calls
- [ ] ThinkingBlock collapses by default, expands on click with smooth animation
- [ ] TestResults detects and parses output from vitest, jest, pytest, go test, cargo test
- [ ] CostTracker updates in real-time as new cost events arrive
- [ ] ImagePreview renders inline images for Read tool calls on image files
- [ ] FileLink opens files in the editor pane (or external editor)
- [ ] View toggle switches between Smart View and Raw Terminal without losing state in either view

### Session Search
- [ ] Free-text search across event payloads returns relevant results
- [ ] Filter by event type works (tool_call, thinking, error)
- [ ] Filter by tool name works (Read, Edit, Bash, etc.)
- [ ] Combined filters (text + type + tool) narrow results correctly
- [ ] Search results are navigable (click result scrolls to event in stream)

### Performance
- [ ] Stream parse latency < 10ms per event (benchmark with Go testing.B)
- [ ] Smart View handles 1000+ events without scroll jank (60fps)
- [ ] WebSocket message delivery < 5ms from Go to Solid signal update
- [ ] SQLite batch writes do not block the parser goroutine
- [ ] Memory usage < 20MB for a session with 5000 events

---

## Estimated Effort

| Part | Scope | Effort |
|------|-------|--------|
| A: Stream Parser (Go) | Event types, parser goroutine, cost accumulator, PTY integration | 4-5 days |
| B: WebSocket Hub | Hub, HTTP handler, frontend WS client | 2-3 days |
| C: SQLite Persistence | Migration, sqlc queries, batch persister | 1-2 days |
| D: Smart View Components | 8 Solid.js components | 5-7 days |
| E: Raw Terminal Toggle | View mode toggle, dual-mount strategy | 1 day |
| F: Session History Search | Go search API, search UI component | 2-3 days |
| G: Shared Types + Registry | TS types, component registry | 0.5 days |
| H: Vanilla Extract Styles | Theme tokens, component styles | 1-2 days (parallel) |

**Total: 16-23 working days (3-4.5 weeks)**

Buffer: Add 3-5 days for integration testing between Go parser and Solid.js frontend, edge cases in stream-json format changes across Claude CLI versions, and WebSocket reliability under load.

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Claude CLI stream-json format changes between versions | HIGH | Pin to a known Claude CLI version for initial development. Add version detection in parser. Log unknown event types as warnings, pass through as raw JSON. |
| WebSocket within Wails v2 adds architectural complexity | MEDIUM | Keep the WS server minimal (one endpoint, one handler). If Wails events prove sufficient for throughput, consider dropping WS in favor of Wails event bus for parsed events (keep WS only for raw terminal bytes). |
| Diff computation is expensive for large files | MEDIUM | Cap diff input at 10,000 lines. For larger files, show "File too large for inline diff" with a link to open in Monaco. |
| xterm.js and Smart View fighting for the same PTY bytes | MEDIUM | TeeReader ensures both get identical bytes. Smart View parser runs independently -- if it falls behind, it buffers. Raw terminal is never blocked by parser. |
| Solid.js `<For>` performance with 10,000+ events | LOW | Integrate `@tanstack/solid-virtual` for virtualized rendering. Only mount DOM nodes for visible events. Threshold: enable virtualization above 500 events. |

---

## Open Questions

1. **Should Smart View be the default, or Raw Terminal?** Recommendation: Smart View default for Claude sessions, Raw Terminal default for non-Claude shells.
2. **Accept/Reject on Edit diffs -- Phase 3 or Phase 5?** Recommendation: Render diffs in Phase 3, add Accept/Reject buttons in Phase 5 (Safety Rules) since they depend on the session policy engine.
3. **Syntax highlighter choice for DiffViewer:** Shiki (WASM-based, accurate but heavier) vs Prism.js (lighter, less accurate for edge cases). Recommendation: Start with Shiki -- its WASM bundle is loaded once and cached.
4. **Event backfill on reconnect:** When WebSocket reconnects, should the client fetch missed events from SQLite? Recommendation: Yes -- on reconnect, client sends last-known event ID, Go returns all events after that ID.

---

**Author:** Subash Karki
