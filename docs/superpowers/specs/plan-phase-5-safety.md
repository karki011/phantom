# Phase 5: Configurable Safety Rules Engine

**Author:** Subash Karki
**Date:** 2026-04-18
**Status:** Draft
**Dependencies:** Phase 3 (Stream Parser + Smart View)

---

## Goal

Build a real-time safety rules engine that evaluates Claude stream-json events as they flow through PhantomOS, catching dangerous operations before they execute. The engine must support admin-defined YAML rules with four behavior levels (block, warn, confirm, log), PII/pattern scanning with allowlists, sliding-window rate limiting, hot-reload, dry-run mode, a full audit trail, and a Solid.js admin dashboard for rule management, audit viewing, and effectiveness metrics.

**Motivating incident:** SIRT cross-org data exposure where CS reps wrote org context to wrong partitions. A properly configured rule matching `set_org_context` writes where `payload.org_id != session.org_id` would have blocked this at the tool-call boundary. This engine must catch that entire class of issue: wrong-partition writes, PII leakage in outbound payloads, and anomalous burst activity.

---

## Prerequisites

- Phase 3 complete: Go stream-json parser operational, `StreamEvent` types defined, WebSocket hub broadcasting events to frontend
- SQLite database layer operational with `sqlc` code generation pipeline (Phase 1)
- Wails event system working for Go-to-Solid push notifications (Phase 0/1)
- `fsnotify` dependency already in `go.mod` (used by session collectors in Phase 1)
- Solid.js component architecture established with Kobalte headless components and Vanilla Extract styling (Phase 0/1)

---

## Tasks

### Part A: Go Backend -- Rule Engine Core

#### A1. Define rule data model and types

**File:** `internal/safety/types.go`

Define the core type system for the safety engine:

```go
type Severity string
const (
    SeverityCritical Severity = "critical"
    SeverityHigh     Severity = "high"
    SeverityMedium   Severity = "medium"
    SeverityLow      Severity = "low"
)

type Behavior string
const (
    BehaviorBlock   Behavior = "block"
    BehaviorWarn    Behavior = "warn"
    BehaviorConfirm Behavior = "confirm"
    BehaviorLog     Behavior = "log"
    BehaviorDryRun  Behavior = "dry_run"
)

type RuleTrigger struct {
    Tool    string `yaml:"tool"`
    AnyTool bool   `yaml:"any_tool"`
    Action  string `yaml:"action"`
}

type RuleCheck struct {
    PayloadField string   `yaml:"payload_field"`
    MustMatch    string   `yaml:"must_match"`
    ScanFor      []string `yaml:"scan_for"`
    Allowlist    []string `yaml:"allowlist"`
    Rate         string   `yaml:"rate"` // e.g., "> 5 writes in 60s"
}

type Rule struct {
    Name        string      `yaml:"name"`
    Description string      `yaml:"description"`
    Trigger     RuleTrigger `yaml:"trigger"`
    Check       RuleCheck   `yaml:"check"`
    Severity    Severity    `yaml:"severity"`
    Behavior    Behavior    `yaml:"behavior"`
    Enabled     bool        `yaml:"enabled"`
    Version     string      // SHA-256 hash computed on load, not in YAML
}

type RuleSet struct {
    Rules []Rule `yaml:"rules"`
}

type RuleResult struct {
    Triggered   bool
    Rule        Rule
    Message     string
    PayloadHash string // SHA-256 of the payload, never the raw payload
    Timestamp   time.Time
    SessionID   string
    EventID     string
}
```

- All types must be exported for use across the `safety` package and `app` bindings
- `Version` field is computed as SHA-256 of the serialized rule definition (not user-provided)
- `PayloadHash` uses SHA-256 to avoid storing secrets/PII in audit trail

#### A2. YAML rule loader with validation

**File:** `internal/safety/rules.go`

Implement the YAML rule definition loader:

1. Load rules from `~/.phantom-os/safety-rules.yaml`
2. Parse YAML using `gopkg.in/yaml.v3`
3. Validate each rule on load:
   - `name` is required and unique across all rules
   - `trigger` must have either `tool` or `any_tool: true` (not both empty)
   - `behavior` must be one of the four levels or `dry_run`
   - `severity` must be one of: critical, high, medium, low
   - `check.rate` must parse to valid rate expression (regex: `> \d+ \w+ in \d+s`)
   - `check.scan_for` entries must be recognized scanner types (see A4)
   - `check.must_match` references must use `session.` prefix for session field refs
4. Reject the entire file if any rule fails validation (log all errors, keep previous ruleset active)
5. Return structured validation errors with line numbers where possible
6. Compute SHA-256 `Version` hash for each rule on load
7. Store validated rules in thread-safe `sync.RWMutex`-protected field
8. Ship a default `safety-rules.yaml` with the cross-org write rule from the motivating incident

```go
type RuleLoader struct {
    mu       sync.RWMutex
    rules    []Rule
    filePath string
    logger   *charmbracelet.Logger
}

func NewRuleLoader(filePath string, logger *charmbracelet.Logger) *RuleLoader
func (l *RuleLoader) Load() error
func (l *RuleLoader) Rules() []Rule  // Returns snapshot under read lock
func (l *RuleLoader) Validate(data []byte) []ValidationError
```

#### A3. Hot-reload via fsnotify with debounce

**File:** `internal/safety/rules.go` (extend from A2)

Add hot-reload capability to the rule loader:

1. Watch `~/.phantom-os/safety-rules.yaml` with `fsnotify`
2. On file change event, start a 500ms debounce timer (reset on subsequent events within window)
3. After debounce settles, read + validate the new YAML
4. If validation passes: atomically swap the rule set (under write lock), log rule count and version hashes
5. If validation fails: keep previous rules active, log validation errors, emit Wails event `safety:reload-error` with error details so the admin dashboard can show the failure
6. Emit Wails event `safety:rules-reloaded` with rule count and timestamp on success
7. The watcher runs as a dedicated goroutine with `context.Context` for lifecycle

```go
func (l *RuleLoader) StartWatching(ctx context.Context) error
func (l *RuleLoader) stopWatching()
```

#### A4. PII/pattern scanner with allowlists

**File:** `internal/safety/scanner.go`

Implement pattern detection for sensitive data in event payloads:

1. Scanner types (matching `check.scan_for` values):
   - `email` -- RFC 5322 regex, common patterns
   - `ssn` -- `\d{3}-\d{2}-\d{4}` and variants (no dashes, spaces)
   - `api_key` -- Heuristic: strings matching common API key patterns (AWS `AKIA...`, GitHub `ghp_...`, generic long hex/base64 tokens)
   - `phone` -- US phone patterns: `(\d{3}) \d{3}-\d{4}`, `\d{3}-\d{3}-\d{4}`, `+1...`
   - `credit_card` -- Luhn-validated 13-19 digit sequences
   - `ip_address` -- IPv4 and IPv6 patterns
2. Allowlist matching:
   - Glob patterns (e.g., `*@company.com` matches `alice@company.com`)
   - Exact match for non-glob entries
   - Per-rule allowlists from YAML `check.allowlist`
3. Scanner is stateless -- receives a string payload, returns list of `ScanMatch` structs
4. Pre-compile all regexes at scanner creation time (not per-call)

```go
type ScanMatch struct {
    Type       string // "email", "ssn", etc.
    Value      string // The matched value (redacted in logs: first 3 chars + "***")
    StartIndex int
    EndIndex   int
}

type Scanner struct {
    patterns  map[string]*regexp.Regexp
    logger    *charmbracelet.Logger
}

func NewScanner(logger *charmbracelet.Logger) *Scanner
func (s *Scanner) Scan(payload string, scanFor []string, allowlist []string) []ScanMatch
func (s *Scanner) matchesAllowlist(value string, allowlist []string) bool
```

#### A5. Sliding window rate limiter

**File:** `internal/safety/ratelimit.go`

Implement in-memory sliding window rate limiting per session:

1. Parse rate expressions from rules: `"> N actions in Xs"` (e.g., `"> 5 writes in 60s"`)
2. Maintain per-session, per-rule counters using a sliding window algorithm
3. Data structure: `map[sessionID+ruleName][]timestamp` with a sorted slice of timestamps
4. On each event: append current timestamp, evict timestamps outside the window, check count against threshold
5. Thread safety: `sync.RWMutex` per rate limiter instance (one instance per engine)
6. Memory management: periodically (every 60s) sweep and remove entries for sessions that have been idle for 2x the window duration
7. No persistence needed -- rate limits reset on app restart (acceptable for desktop app)

```go
type RateExpression struct {
    Threshold int
    Action    string // "writes", "reads", etc. (or empty for any)
    WindowSec int
}

type RateLimiter struct {
    mu       sync.Mutex
    windows  map[string][]time.Time // key = sessionID:ruleName
    logger   *charmbracelet.Logger
}

func NewRateLimiter(logger *charmbracelet.Logger) *RateLimiter
func (r *RateLimiter) Check(sessionID string, ruleName string, expr RateExpression) bool // true = rate exceeded
func (r *RateLimiter) Record(sessionID string, ruleName string)
func (r *RateLimiter) StartCleanup(ctx context.Context, interval time.Duration)
func ParseRateExpression(rate string) (RateExpression, error)
```

#### A6. Rule evaluation engine

**File:** `internal/safety/engine.go`

The core engine that ties everything together. Evaluates stream-json events against all active rules:

1. Engine receives `StreamEvent` from the stream parser (Phase 3)
2. Runs as a goroutine per session (spawned by session controller)
3. For each event, iterate all active rules:
   a. Check trigger match (tool name, action type, any_tool flag)
   b. If triggered, run the appropriate check:
      - `payload_field` + `must_match`: extract field from event payload, compare against session context
      - `scan_for`: run PII scanner on serialized payload
      - `rate`: check sliding window rate limiter
   c. If check fails (rule violated), create `RuleResult`
4. Behavior dispatch based on `RuleResult`:
   - `block`: return error to stream pipeline, halt event processing for this event
   - `warn`: emit Wails event `safety:alert` with rule details, continue processing (frontend shows modal)
   - `confirm`: emit Wails event `safety:confirm` with rule details, **pause event processing** until user responds via Wails binding
   - `log`: silently continue, write audit record
   - `dry_run`: log what would have happened, continue processing (no user-visible effect)
5. All triggered rules (including dry_run) write to the audit trail (A7)
6. Multiple rules can fire on a single event -- process in severity order (critical first)

```go
type Engine struct {
    loader      *RuleLoader
    scanner     *Scanner
    rateLimiter *RateLimiter
    auditWriter *AuditWriter
    logger      *charmbracelet.Logger
}

func NewEngine(loader *RuleLoader, scanner *Scanner, rateLimiter *RateLimiter, auditWriter *AuditWriter, logger *charmbracelet.Logger) *Engine
func (e *Engine) Evaluate(ctx context.Context, event StreamEvent, session *Session) ([]RuleResult, error)
func (e *Engine) matchTrigger(rule Rule, event StreamEvent) bool
func (e *Engine) runCheck(ctx context.Context, rule Rule, event StreamEvent, session *Session) (bool, string)
```

**Integration point with Phase 3:** The stream parser's event pipeline calls `engine.Evaluate()` for every event before forwarding to the WebSocket hub. This is the interception point.

#### A7. Audit trail writer

**File:** `internal/safety/audit.go`

Persistent audit trail for all safety rule evaluations:

1. Write to `safety_audit` SQLite table via sqlc-generated code
2. Schema:
   ```sql
   CREATE TABLE safety_audit (
       id            INTEGER PRIMARY KEY AUTOINCREMENT,
       session_id    TEXT NOT NULL,
       timestamp     TEXT NOT NULL,  -- ISO 8601
       rule_name     TEXT NOT NULL,
       rule_version  TEXT NOT NULL,  -- SHA-256 hash of rule definition
       severity      TEXT NOT NULL,
       tool_call     TEXT,           -- tool name that triggered the rule
       event_type    TEXT,           -- stream event type
       payload_hash  TEXT NOT NULL,  -- SHA-256 of payload (never raw payload)
       action_taken  TEXT NOT NULL,  -- "blocked", "warned", "confirmed", "logged", "dry_run"
       user_response TEXT,           -- "acknowledged", "bypassed", "cancelled", NULL for log/dry_run
       acknowledged_by TEXT,         -- OS username
       bypass_reason TEXT,           -- Required when user_response = "bypassed"
       created_at    TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE INDEX idx_safety_audit_session ON safety_audit(session_id);
   CREATE INDEX idx_safety_audit_rule ON safety_audit(rule_name);
   CREATE INDEX idx_safety_audit_timestamp ON safety_audit(timestamp);
   CREATE INDEX idx_safety_audit_severity ON safety_audit(severity);
   ```
3. `payload_hash` is SHA-256 of the full event payload -- correlatable but not leaking secrets
4. `rule_version` tracks which version of the rule was active when it triggered
5. `acknowledged_by` populated from OS username (`os.Getenv("USER")` or `user.Current()`)
6. Batch writes: buffer up to 10 audit records or 1 second, whichever comes first, then flush (reduces SQLite write pressure)
7. Graceful shutdown: flush remaining buffer on context cancellation

```go
type AuditWriter struct {
    db      *sql.DB
    queries *sqlc.Queries
    buffer  chan AuditRecord
    logger  *charmbracelet.Logger
}

type AuditRecord struct {
    SessionID     string
    Timestamp     time.Time
    RuleName      string
    RuleVersion   string
    Severity      Severity
    ToolCall      string
    EventType     string
    PayloadHash   string
    ActionTaken   string
    UserResponse  *string
    AcknowledgedBy *string
    BypassReason  *string
}

func NewAuditWriter(db *sql.DB, queries *sqlc.Queries, logger *charmbracelet.Logger) *AuditWriter
func (w *AuditWriter) Write(record AuditRecord)
func (w *AuditWriter) Start(ctx context.Context) error
func (w *AuditWriter) Flush() error
func (w *AuditWriter) Query(filters AuditFilters) ([]AuditRecord, error)
```

#### A8. User bypass flow with mandatory logging

**File:** `internal/safety/bypass.go`

Handle the user interaction flow when a rule triggers `warn` or `confirm` behavior:

1. When engine evaluates a `warn` or `confirm` rule:
   - Emit Wails event `safety:alert` with `AlertPayload` (rule name, severity, message, behavior, event summary)
   - For `confirm`: pause the event pipeline for this session (buffered, not dropped)
2. Frontend shows AlertModal (B1), user can:
   - **Acknowledge** (warn): event continues, audit records `user_response: "acknowledged"`
   - **Cancel** (confirm): event is dropped, audit records `user_response: "cancelled"`
   - **Bypass** (confirm): event continues, audit records `user_response: "bypassed"` with mandatory `bypass_reason`
3. Wails binding `RespondToAlert(alertID, response, reason)` receives the user's choice
4. Bypass is **always** logged -- there is no silent bypass path
5. `block` behavior has no bypass flow -- only changeable by editing the YAML config
6. Timeout: if user doesn't respond to a `confirm` within 60 seconds, auto-cancel with `user_response: "timeout"`

```go
type AlertPayload struct {
    AlertID   string   `json:"alertId"`
    RuleName  string   `json:"ruleName"`
    Severity  Severity `json:"severity"`
    Behavior  Behavior `json:"behavior"`
    Message   string   `json:"message"`
    ToolCall  string   `json:"toolCall"`
    Timestamp string   `json:"timestamp"`
}

type AlertResponse struct {
    AlertID  string  `json:"alertId"`
    Response string  `json:"response"` // "acknowledged", "cancelled", "bypassed"
    Reason   string  `json:"reason"`   // Required for "bypassed"
}

// Pending alerts tracked in-memory with channels for response signaling
type BypassManager struct {
    pending map[string]chan AlertResponse
    mu      sync.Mutex
    audit   *AuditWriter
    logger  *charmbracelet.Logger
}

func NewBypassManager(audit *AuditWriter, logger *charmbracelet.Logger) *BypassManager
func (b *BypassManager) CreateAlert(payload AlertPayload) <-chan AlertResponse
func (b *BypassManager) Respond(resp AlertResponse) error
func (b *BypassManager) startTimeoutWatcher(alertID string, timeout time.Duration)
```

#### A9. Wails bindings for safety engine

**File:** `internal/app/bindings_safety.go`

Expose safety engine operations to the Solid.js frontend via Wails bindings:

```go
// Rule management (read-only from UI -- edits happen in YAML)
func (a *App) GetSafetyRules() ([]Rule, error)
func (a *App) ValidateRulesYAML(yaml string) ([]ValidationError, error)
func (a *App) GetRulesFilePath() string

// Alert response
func (a *App) RespondToSafetyAlert(alertID string, response string, reason string) error

// Audit queries
func (a *App) GetAuditLog(filters AuditFilters) ([]AuditRecord, error)
func (a *App) GetAuditStats(timeRange string) (AuditStats, error)

// Rule metrics
func (a *App) GetRuleMetrics(timeRange string) ([]RuleMetric, error)
func (a *App) GetBypassPatterns(timeRange string) ([]BypassPattern, error)

// Engine control
func (a *App) GetSafetyEngineStatus() EngineStatus
func (a *App) ReloadSafetyRules() error  // Manual reload trigger
```

#### A10. sqlc query definitions

**File:** `internal/db/queries/safety_audit.sql`

```sql
-- name: InsertAuditRecord :exec
INSERT INTO safety_audit (
    session_id, timestamp, rule_name, rule_version, severity,
    tool_call, event_type, payload_hash, action_taken,
    user_response, acknowledged_by, bypass_reason
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- name: GetAuditLog :many
SELECT * FROM safety_audit
WHERE (?1 IS NULL OR session_id = ?1)
  AND (?2 IS NULL OR rule_name = ?2)
  AND (?3 IS NULL OR severity = ?3)
  AND (?4 IS NULL OR timestamp >= ?4)
  AND (?5 IS NULL OR timestamp <= ?5)
ORDER BY timestamp DESC
LIMIT ?6 OFFSET ?7;

-- name: GetAuditCount :one
SELECT COUNT(*) FROM safety_audit
WHERE (?1 IS NULL OR timestamp >= ?1)
  AND (?2 IS NULL OR timestamp <= ?2);

-- name: GetRuleTriggerCounts :many
SELECT rule_name, severity, action_taken, COUNT(*) as count
FROM safety_audit
WHERE timestamp >= ?1
GROUP BY rule_name, severity, action_taken
ORDER BY count DESC;

-- name: GetBypassPatterns :many
SELECT acknowledged_by, rule_name, COUNT(*) as bypass_count,
       MAX(timestamp) as last_bypass
FROM safety_audit
WHERE user_response = 'bypassed'
  AND timestamp >= ?1
GROUP BY acknowledged_by, rule_name
ORDER BY bypass_count DESC;

-- name: GetRecentAlerts :many
SELECT * FROM safety_audit
WHERE action_taken IN ('blocked', 'warned', 'confirmed')
ORDER BY timestamp DESC
LIMIT ?1;
```

#### A11. Database migration

**File:** `internal/db/migrations/NNNNNN_add_safety_audit.up.sql`

(Where `NNNNNN` is the next sequential migration number)

```sql
CREATE TABLE IF NOT EXISTS safety_audit (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    timestamp       TEXT NOT NULL,
    rule_name       TEXT NOT NULL,
    rule_version    TEXT NOT NULL,
    severity        TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low')),
    tool_call       TEXT,
    event_type      TEXT,
    payload_hash    TEXT NOT NULL,
    action_taken    TEXT NOT NULL CHECK(action_taken IN ('blocked', 'warned', 'confirmed', 'logged', 'dry_run')),
    user_response   TEXT CHECK(user_response IN ('acknowledged', 'bypassed', 'cancelled', 'timeout') OR user_response IS NULL),
    acknowledged_by TEXT,
    bypass_reason   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_safety_audit_session ON safety_audit(session_id);
CREATE INDEX IF NOT EXISTS idx_safety_audit_rule ON safety_audit(rule_name);
CREATE INDEX IF NOT EXISTS idx_safety_audit_timestamp ON safety_audit(timestamp);
CREATE INDEX IF NOT EXISTS idx_safety_audit_severity ON safety_audit(severity);
CREATE INDEX IF NOT EXISTS idx_safety_audit_action ON safety_audit(action_taken);
```

**File:** `internal/db/migrations/NNNNNN_add_safety_audit.down.sql`

```sql
DROP INDEX IF EXISTS idx_safety_audit_action;
DROP INDEX IF EXISTS idx_safety_audit_severity;
DROP INDEX IF EXISTS idx_safety_audit_timestamp;
DROP INDEX IF EXISTS idx_safety_audit_rule;
DROP INDEX IF EXISTS idx_safety_audit_session;
DROP TABLE IF EXISTS safety_audit;
```

#### A12. Default safety rules file

**File:** `defaults/safety-rules.yaml` (shipped with binary, copied to `~/.phantom-os/` on first run if absent)

```yaml
# PhantomOS Safety Rules
# Edit this file to add/modify rules. Changes are hot-reloaded (500ms debounce).
# Behavior levels: block | warn | confirm | log | dry_run

rules:
  - name: "Cross-org context write"
    description: "Blocks writes where org_id in payload does not match session org_id. Prevents cross-org data exposure."
    trigger:
      tool: "set_org_context"
      action: "write"
    check:
      payload_field: "org_id"
      must_match: session.org_id
    severity: critical
    behavior: block
    enabled: true

  - name: "PII in outbound payload"
    description: "Warns when PII patterns (email, SSN, API keys, phone) detected in tool call payloads."
    trigger:
      any_tool: true
    check:
      scan_for: [email, ssn, api_key, phone]
      allowlist: []
    severity: high
    behavior: warn
    enabled: true

  - name: "Bulk writes in short window"
    description: "Warns when write operations exceed 5 per minute in a single session."
    trigger:
      any_tool: true
      action: "write"
    check:
      rate: "> 5 writes in 60s"
    severity: medium
    behavior: warn
    enabled: true

  - name: "Destructive git operations"
    description: "Requires confirmation for force push, reset --hard, and branch delete."
    trigger:
      tool: "Bash"
      action: "execute"
    check:
      scan_for: []
      payload_field: "command"
      must_match: ""
    severity: high
    behavior: confirm
    enabled: false

  - name: "Large file write"
    description: "Logs when a single file write exceeds 10KB. Dry-run by default -- promote to warn when validated."
    trigger:
      tool: "Write"
      action: "write"
    check:
      payload_field: "content_length"
      must_match: ""
    severity: low
    behavior: dry_run
    enabled: true
```

#### A13. Integration with stream parser pipeline

**File:** `internal/stream/parser.go` (modify existing Phase 3 file)

Add the safety engine interception point to the stream parser event pipeline:

1. After parsing a `StreamEvent`, before forwarding to WebSocket hub:
   ```go
   results, err := safetyEngine.Evaluate(ctx, event, session)
   ```
2. If any result has `behavior: block`, drop the event and emit error to session
3. If any result has `behavior: confirm`, pause pipeline and wait for user response via channel
4. All other behaviors (warn, log, dry_run) are non-blocking -- event continues through pipeline
5. Safety evaluation must not add more than 5ms latency to the event pipeline (scanner regexes are pre-compiled, rate limiter is in-memory)

#### A14. Engine unit tests

**File:** `internal/safety/engine_test.go`

Comprehensive test coverage (target: >80%):

1. **Rule loading tests:**
   - Valid YAML parses correctly
   - Invalid YAML rejected (missing name, bad severity, bad behavior, bad rate expression)
   - Duplicate rule names rejected
   - Version hash computed and stable
   - Partial YAML failure keeps previous rules

2. **Trigger matching tests:**
   - Specific tool match
   - `any_tool: true` matches all tools
   - Action type filtering
   - Non-matching tool/action returns no trigger

3. **Check evaluation tests:**
   - `payload_field` + `must_match` with matching session field
   - `payload_field` + `must_match` with non-matching session field (trigger)
   - PII scanner integration: email detected, allowlisted email passes
   - Rate limiter: under threshold passes, over threshold triggers

4. **Behavior dispatch tests:**
   - `block` returns error, event not forwarded
   - `warn` emits alert, event forwarded
   - `confirm` pauses, resumes on acknowledge, drops on cancel
   - `log` silently passes
   - `dry_run` logs but does not block/warn

5. **Audit trail tests:**
   - Every triggered rule writes audit record
   - `payload_hash` matches SHA-256 of payload
   - `rule_version` matches loaded rule hash
   - Bypass records include reason and username

6. **Rate limiter tests:**
   - Window slides correctly (old entries evicted)
   - Different sessions isolated
   - Cleanup goroutine removes stale entries

7. **Scanner tests:**
   - Each pattern type detects correctly (email, SSN, API key, phone, credit card, IP)
   - Allowlist glob matching works
   - No false positives on common text

8. **Hot-reload tests:**
   - File change triggers reload after debounce
   - Rapid file changes coalesce into single reload
   - Invalid new YAML keeps old rules
   - Valid new YAML swaps atomically

9. **Integration test:**
   - End-to-end: stream event -> engine evaluate -> audit record written -> correct behavior dispatched
   - Cross-org write rule blocks correctly (the motivating incident scenario)

### Part B: Solid.js Frontend -- Admin Dashboard

#### B1. AlertModal component

**File:** `frontend/src/components/safety/AlertModal.tsx`

Modal that appears when a safety rule triggers `warn` or `confirm`:

1. Uses Kobalte `Dialog` primitive for accessible modal overlay
2. Displays:
   - Rule name and severity (color-coded: critical=red, high=orange, medium=yellow, low=blue)
   - Description of what was detected
   - Tool call that triggered it
   - Timestamp
3. Actions based on behavior:
   - `warn`: single "Acknowledge" button (continues processing)
   - `confirm`: "Allow" and "Cancel" buttons. "Allow" requires typing a reason in a text input (minimum 10 characters)
4. `block` rules do not show this modal -- they show a non-dismissible notification toast instead
5. Subscribes to Wails event `safety:alert` via signal
6. Calls Wails binding `RespondToSafetyAlert()` on user action
7. Auto-dismiss warn modals after 30 seconds with auto-acknowledge (logged)
8. Animations: slide-in from top, Solo Leveling danger glow for critical severity

```typescript
// Signal integration
const [activeAlert, setActiveAlert] = createSignal<AlertPayload | null>(null);

EventsOn('safety:alert', (payload: AlertPayload) => {
    setActiveAlert(payload);
});
```

#### B2. AuditLog component

**File:** `frontend/src/components/safety/AuditLog.tsx`

Searchable, filterable audit trail viewer:

1. Uses `@tanstack/solid-virtual` for virtualized list (audit logs can grow large)
2. Filter controls:
   - Time range picker (last hour, 24h, 7d, 30d, custom)
   - Severity filter (checkboxes for each level)
   - Rule name filter (dropdown populated from distinct rule names in log)
   - Action taken filter (blocked, warned, confirmed, logged, dry_run)
   - Session ID filter (text input)
   - Free-text search across rule names and tool calls
3. Each audit row displays:
   - Timestamp (relative + absolute on hover)
   - Severity badge (color-coded)
   - Rule name
   - Tool call
   - Action taken
   - User response (if applicable)
   - Acknowledged by (username)
4. Click row to expand: shows bypass reason, payload hash, rule version, full details
5. Export to CSV button (client-side generation)
6. Data fetched via Wails binding `GetAuditLog()` with pagination (50 records per page)
7. Real-time updates: new audit records pushed via Wails event `safety:audit-new` append to top of list

#### B3. RuleEditor component

**File:** `frontend/src/components/safety/RuleEditor.tsx`

YAML editor with live validation preview:

1. Embeds Monaco editor (already available from Phase 3/editor integration) with YAML language mode
2. Loads current rules file content via Wails binding `GetRulesFilePath()` + file read
3. On every keystroke (debounced 300ms), sends YAML to `ValidateRulesYAML()` binding
4. Validation panel below editor shows:
   - Green checkmark: "N rules valid" when all pass
   - Red error list: specific validation errors with rule name and field
5. "Save" button writes to the rules file (triggers hot-reload)
6. "Reset to Default" button restores shipped defaults
7. Side panel: rule reference documentation (behavior levels, check types, rate expression syntax)
8. Read-only mode toggle for viewing without risk of accidental edits

#### B4. RuleMetrics component

**File:** `frontend/src/components/safety/RuleMetrics.tsx`

Dashboard showing safety engine effectiveness metrics:

1. Time range selector (same as AuditLog)
2. Summary cards (top row):
   - Total rules active
   - Events evaluated (total stream events processed)
   - Rules triggered (count)
   - Block rate (% of evaluated events that were blocked)
   - Bypass rate (% of warn/confirm that were bypassed vs acknowledged/cancelled)
3. Per-rule breakdown table:
   - Rule name
   - Trigger count
   - Block count / Warn count / Confirm count / Log count
   - Bypass count and bypass rate for this rule
   - Last triggered timestamp
   - Effectiveness score: `1 - (bypass_count / trigger_count)` (rules that are always bypassed may need tuning)
4. Trend chart: triggers per day over the selected time range (simple bar chart, no heavy charting library -- use SVG/canvas directly or a lightweight Solid-compatible chart)
5. Data fetched via Wails bindings `GetRuleMetrics()` and `GetAuditStats()`
6. Auto-refresh every 30 seconds when panel is visible

#### B5. PatternDetection component

**File:** `frontend/src/components/safety/PatternDetection.tsx`

Identifies behavioral patterns in rule bypasses and triggers:

1. "Frequent Bypassers" section:
   - Table: username, rule name, bypass count, last bypass date
   - Highlight rows where bypass count > 3 in last 7 days (configurable threshold)
   - "User X bypassed rule Y N times this week" summary cards
2. "Rule Fatigue" section:
   - Rules with >80% bypass rate flagged as "likely too strict or poorly targeted"
   - Recommendation: "Consider switching to dry_run or refining the check"
3. "Emerging Patterns" section:
   - Time-bucketed analysis: "Bypasses spike during hours H-H" (if data supports)
   - New tools triggering rules that weren't before
4. Data fetched via Wails binding `GetBypassPatterns()`
5. All pattern analysis computed server-side in Go (not in frontend) -- frontend only renders

#### B6. Safety dashboard layout

**File:** `frontend/src/components/safety/SafetyDashboard.tsx`

Container component that organizes the safety admin dashboard:

1. Tab layout with four tabs:
   - **Overview** (RuleMetrics) -- default tab
   - **Audit Log** (AuditLog)
   - **Rules** (RuleEditor)
   - **Patterns** (PatternDetection)
2. Uses Kobalte `Tabs` primitive
3. Status bar at bottom: engine status (active/disabled), rule count, last reload timestamp, any reload errors
4. Accessible via main app navigation (sidebar or command palette)

#### B7. Safety signals (shared reactive state)

**File:** `frontend/src/signals/safety.ts`

Centralized safety-related signals:

```typescript
import { createSignal, createResource } from 'solid-js';
import { EventsOn } from '../../wailsjs/runtime';
import { GetSafetyRules, GetSafetyEngineStatus } from '../../wailsjs/go/main/App';

// Active alert (shown in AlertModal)
export const [activeAlert, setActiveAlert] = createSignal<AlertPayload | null>(null);

// Engine status
export const [engineStatus, { refetch: refetchStatus }] = createResource(GetSafetyEngineStatus);

// Rules list
export const [rules, { refetch: refetchRules }] = createResource(GetSafetyRules);

// Reload errors
export const [reloadError, setReloadError] = createSignal<string | null>(null);

// Wire up Wails events
EventsOn('safety:alert', (payload: AlertPayload) => setActiveAlert(payload));
EventsOn('safety:rules-reloaded', () => { refetchRules(); refetchStatus(); setReloadError(null); });
EventsOn('safety:reload-error', (err: string) => setReloadError(err));
EventsOn('safety:audit-new', () => { /* trigger audit log refresh if visible */ });
```

#### B8. TypeScript types for safety

**File:** `frontend/src/types/safety.ts`

TypeScript type definitions matching Go structs (auto-generated by Wails for bindings, manually maintained for WebSocket events):

```typescript
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Behavior = 'block' | 'warn' | 'confirm' | 'log' | 'dry_run';
export type UserResponse = 'acknowledged' | 'bypassed' | 'cancelled' | 'timeout';

export interface AlertPayload {
    alertId: string;
    ruleName: string;
    severity: Severity;
    behavior: Behavior;
    message: string;
    toolCall: string;
    timestamp: string;
}

export interface AuditRecord {
    id: number;
    sessionId: string;
    timestamp: string;
    ruleName: string;
    ruleVersion: string;
    severity: Severity;
    toolCall: string;
    eventType: string;
    payloadHash: string;
    actionTaken: string;
    userResponse: UserResponse | null;
    acknowledgedBy: string | null;
    bypassReason: string | null;
}

export interface AuditFilters {
    sessionId?: string;
    ruleName?: string;
    severity?: Severity;
    startTime?: string;
    endTime?: string;
    limit: number;
    offset: number;
}

export interface RuleMetric {
    ruleName: string;
    triggerCount: number;
    blockCount: number;
    warnCount: number;
    confirmCount: number;
    logCount: number;
    bypassCount: number;
    bypassRate: number;
    lastTriggered: string;
    effectivenessScore: number;
}

export interface BypassPattern {
    username: string;
    ruleName: string;
    bypassCount: number;
    lastBypass: string;
}

export interface EngineStatus {
    active: boolean;
    ruleCount: number;
    lastReload: string;
    reloadError: string | null;
    eventsEvaluated: number;
    rulesTriggered: number;
}
```

### Part C: Integration and Wiring

#### C1. Register safety engine in app startup

**File:** `cmd/phantomos/main.go` (modify existing)

Wire safety engine into the application lifecycle:

1. Create `RuleLoader` with path `~/.phantom-os/safety-rules.yaml`
2. If rules file doesn't exist, copy from `defaults/safety-rules.yaml`
3. Load and validate rules
4. Create `Scanner`, `RateLimiter`, `AuditWriter`, `BypassManager`
5. Create `Engine` with all dependencies
6. Start `RuleLoader.StartWatching(ctx)` goroutine
7. Start `RateLimiter.StartCleanup(ctx)` goroutine
8. Start `AuditWriter.Start(ctx)` goroutine
9. Pass engine to stream parser for event interception (A13)
10. Register all Wails bindings from `bindings_safety.go`
11. On shutdown: cancel context (stops all goroutines), flush audit buffer

#### C2. Implement RuleChecker interface

**File:** `internal/plugin/interfaces.go` (modify existing)

Ensure the `RuleChecker` extension interface (defined in master spec section 11) is implemented by the safety engine:

```go
// Already defined in spec:
type RuleChecker interface {
    Name() string
    Check(ctx context.Context, event StreamEvent, session *Session) (RuleResult, error)
}
```

The safety engine's per-rule evaluation should implement this interface, allowing custom rule checkers to be registered via the plugin system in Phase 9.

---

## Acceptance Criteria

### Functional

1. **Rule loading:** YAML rules load on startup, malformed rules are rejected with clear error messages, valid rules are active immediately
2. **Hot-reload:** Editing `safety-rules.yaml` reloads rules within 1 second (500ms debounce + load time), invalid edits do not break the running engine
3. **Block behavior:** Events matching `block` rules are dropped and never reach the WebSocket hub or downstream consumers
4. **Warn behavior:** Events matching `warn` rules trigger AlertModal in the UI, event continues processing, user acknowledgement is logged
5. **Confirm behavior:** Events matching `confirm` rules pause the pipeline, resume or drop based on user response, bypass requires reason text
6. **Log behavior:** Events matching `log` rules pass through silently with an audit record written
7. **Dry-run mode:** Rules with `behavior: dry_run` log what would have happened without any user-visible effect
8. **PII scanner:** Detects emails, SSNs, API keys, phone numbers, credit cards, and IP addresses in payloads; allowlisted values pass through
9. **Rate limiting:** Sliding window correctly counts events per session, triggers when threshold exceeded, cleans up stale entries
10. **Audit trail:** Every rule trigger (including dry_run) writes a record to `safety_audit` with payload hash (never raw payload), rule version, timestamp, and outcome
11. **User bypass:** All bypasses require a reason and are logged with OS username identity
12. **Cross-org write rule:** The default shipped rule catches the motivating incident scenario (org_id mismatch on set_org_context writes)
13. **Admin dashboard:** All five components render correctly: AlertModal, AuditLog, RuleEditor, RuleMetrics, PatternDetection
14. **Rule validation preview:** RuleEditor shows real-time validation errors as user types YAML

### Non-Functional

15. **Latency:** Safety engine evaluation adds <5ms to the stream event pipeline (measured p99)
16. **Memory:** Rate limiter and pending alerts consume <10MB even with 10 concurrent sessions
17. **Test coverage:** >80% line coverage on `internal/safety/` package
18. **Concurrency safety:** No data races under `go test -race` for all safety package tests
19. **Graceful degradation:** If safety engine fails to start (bad rules file, DB error), the app starts with engine disabled and a warning banner -- never crashes the entire app

---

## Estimated Effort

| Component | Effort | Notes |
|---|---|---|
| A1-A3: Types, loader, hot-reload | 2-3 days | YAML parsing, fsnotify debounce, validation logic |
| A4: PII scanner | 2 days | Regex compilation, allowlist matching, test coverage for each pattern |
| A5: Rate limiter | 1 day | Sliding window algorithm, cleanup goroutine |
| A6: Rule engine core | 2-3 days | Trigger matching, check evaluation, behavior dispatch, session context integration |
| A7-A8: Audit trail + bypass flow | 2 days | SQLite writes, batch buffering, channel-based confirm flow, timeout handling |
| A9-A11: Bindings, queries, migration | 1 day | Boilerplate-heavy but straightforward |
| A12-A13: Default rules + parser integration | 1 day | Wire engine into existing stream parser pipeline |
| A14: Unit tests | 2-3 days | Comprehensive test suite, integration test for motivating incident |
| B1: AlertModal | 1 day | Kobalte Dialog, severity theming, bypass reason input |
| B2: AuditLog | 2 days | Virtualized list, filters, pagination, real-time updates, CSV export |
| B3: RuleEditor | 1-2 days | Monaco YAML mode, live validation, save/reset |
| B4: RuleMetrics | 1-2 days | Summary cards, per-rule table, trend chart |
| B5: PatternDetection | 1 day | Bypass pattern rendering, fatigue detection display |
| B6-B8: Dashboard layout, signals, types | 1 day | Wiring, tab layout, shared state |
| C1-C2: Integration + wiring | 1 day | App startup, interface compliance |
| **Total** | **~2.5-3 weeks** | Aligns with master spec estimate of 2-3 weeks |

---

## Author

Subash Karki
