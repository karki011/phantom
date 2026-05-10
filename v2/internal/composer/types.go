// Author: Subash Karki
//
// Package composer — types exchanged between the Go service and the Solid
// frontend (via Wails JSON-RPC bindings + EventsEmit).
package composer

// EditStatus is the lifecycle of a single Composer edit card.
//
//	"pending"  — agent wrote to disk, user has not yet decided
//	"accepted" — user clicked the check (just clears the card; file stays)
//	"discarded" — user clicked the X (file reverted via `git checkout --`)
type EditStatus string

const (
	EditPending   EditStatus = "pending"
	EditAccepted  EditStatus = "accepted"
	EditDiscarded EditStatus = "discarded"
)

// Turn is a single user prompt + agent response pair, persisted so we can
// resume across app restarts via `claude --resume`.
type Turn struct {
	ID            string `json:"id"`
	PaneID        string `json:"pane_id"`
	SessionID     string `json:"session_id"`
	CWD           string `json:"cwd"`
	Prompt        string `json:"prompt"`
	Model         string `json:"model"`
	Status        string `json:"status"` // "running" | "done" | "error" | "cancelled"
	InputTokens   int64  `json:"input_tokens"`
	OutputTokens  int64  `json:"output_tokens"`
	CostUSD       float64 `json:"cost_usd"`
	StartedAt     int64  `json:"started_at"`
	CompletedAt   int64  `json:"completed_at"`
	// ResponseText is the assistant's accumulated streamed text for the
	// turn, flushed at done/error/cancelled. Empty for turns recorded
	// before migration 010 — clients should tolerate "" gracefully.
	ResponseText  string  `json:"response_text"`
}

// Edit is a single file change captured during a Turn (after-the-fact via
// fsnotify; v0 does not block writes).
type Edit struct {
	ID         string     `json:"id"`
	TurnID     string     `json:"turn_id"`
	PaneID     string     `json:"pane_id"`
	Path       string     `json:"path"`
	OldContent string     `json:"old_content"`
	NewContent string     `json:"new_content"`
	LinesAdded int        `json:"lines_added"`
	LinesRemoved int      `json:"lines_removed"`
	Status     EditStatus `json:"status"`
	CreatedAt  int64      `json:"created_at"`
	DecidedAt  int64      `json:"decided_at"`
}

// Event is emitted on the "composer:event" channel during a streaming run.
// Carries a pane_id discriminator so multiple Composer panes can stream
// concurrently without cross-talk.
type Event struct {
	PaneID    string `json:"pane_id"`
	TurnID    string `json:"turn_id,omitempty"`
	Type      string `json:"type"` // "delta" | "thinking" | "tool_use" | "tool_result" | "result" | "done" | "error" | "strategy" | "session_started"
	Content   string `json:"content,omitempty"`
	ToolName  string `json:"tool_name,omitempty"`
	ToolInput string `json:"tool_input,omitempty"`
	ToolUseID string `json:"tool_use_id,omitempty"`
	IsError   bool   `json:"is_error,omitempty"`

	// Session-specific fields, populated on type=="session_started".
	SessionID   string `json:"session_id,omitempty"`
	SessionName string `json:"session_name,omitempty"`

	// Result-specific fields, populated on type=="result"|"done".
	InputTokens  int64   `json:"input_tokens,omitempty"`
	OutputTokens int64   `json:"output_tokens,omitempty"`
	CostUSD      float64 `json:"cost_usd,omitempty"`

	// Strategy-specific fields, populated on type=="strategy".
	// Emitted once per turn after the orchestrator selects a strategy,
	// before the CLI run starts.
	StrategyName       string  `json:"strategy_name,omitempty"`
	StrategyConfidence float64 `json:"strategy_confidence,omitempty"`
	TaskComplexity     string  `json:"task_complexity,omitempty"`
	TaskRisk           string  `json:"task_risk,omitempty"`
	BlastRadius        int     `json:"blast_radius,omitempty"`

	// TaskType is the self-classified work type, populated on
	// type=="task_classified". Emitted when the model's <phantom:task_type>
	// tag is extracted from the streaming response.
	TaskType string `json:"task_type,omitempty"`

	// Enriched prompt text, populated on type=="enriched_prompt".
	// Sent to the frontend so the UI can display the injected context.
	EnrichedText string `json:"enriched_text,omitempty"`
}

// EventRecord is persisted to the composer_events table for session replay.
// Every CLI streaming event produces one row so past sessions can be fully
// rehydrated with thinking blocks, tool calls, and tool results intact.
type EventRecord struct {
	ID        int64  `json:"id"`
	TurnID    string `json:"turn_id"`
	SessionID string `json:"session_id"`
	Seq       int    `json:"seq"`
	Type      string `json:"type"`
	Subtype   string `json:"subtype"`
	ToolName  string `json:"tool_name"`
	ToolUseID string `json:"tool_use_id"`
	Content   string `json:"content"`
	CreatedAt int64  `json:"created_at"`
}

// Mention is an `@file` reference passed alongside a prompt.
type Mention struct {
	Path string `json:"path"`
}

// SessionSummary is one row in the "Past Sessions" sidebar — a compact
// view of an existing claude session aggregated across every pane that
// touched it. Fields are sized for one-line rendering; FirstPrompt is
// truncated to 200 chars before being returned to the frontend.
type SessionSummary struct {
	SessionID      string  `json:"session_id"`
	Name           string  `json:"name"`             // Pokémon-style memorable name
	FirstPaneID    string  `json:"first_pane_id"`    // any pane that touched the session
	FirstPrompt    string  `json:"first_prompt"`     // truncated to 200 chars
	TurnCount      int     `json:"turn_count"`
	LastActivity   int64   `json:"last_activity"`    // unix seconds
	TotalCost      float64 `json:"total_cost"`
	Cwd            string  `json:"cwd"`              // first non-empty cwd seen
	WasInterrupted bool    `json:"was_interrupted"`  // true if any turn in this session was interrupted by a crash
	// Source identifies where this session record came from.
	// "phantom" = Phantom composer DB; "cli" = ~/.claude/sessions/ file
	// written by Claude CLI (terminal, VS Code, Claude Desktop, etc.).
	Source         string  `json:"source"`
}

// EditorContext captures the active editor state at the time a turn is
// submitted — file path, selection, cursor position, and language ID.
// It is injected into the prompt as additional context when present.
type EditorContext struct {
	FilePath  string `json:"file_path"`
	Selection string `json:"selection"`
	Cursor    string `json:"cursor"`
	Language  string `json:"language"`
}

// ChipEvent represents a discrete activity chip emitted during a turn,
// such as a tool call, a file write, or a strategy selection.
type ChipEvent struct {
	Category string `json:"category"`
	Label    string `json:"label"`
	Status   string `json:"status"`
	Source   string `json:"source"`
	Timing   int64  `json:"timing"`
	Tokens   int    `json:"tokens"`
}

// SessionLifecycle describes the current state of a composer session.
type SessionLifecycle string

const (
	LifecycleActive     SessionLifecycle = "active"
	LifecycleHibernated SessionLifecycle = "hibernated"
	LifecycleResuming   SessionLifecycle = "resuming"
	LifecycleArchived   SessionLifecycle = "archived"
)

// SendArgs is the Wails-binding payload for ComposerSend.
//
// NoContext, when true, runs the turn in a fresh temp directory with
// --setting-sources "" so the agent has zero awareness of the user's
// project (no CLAUDE.md, .claude/, hooks, settings, skills). Useful for
// "ask anything" turns that should not leak workspace context. Defaults
// to false — existing callers see no behaviour change.
type SendArgs struct {
	PaneID    string    `json:"pane_id"`
	Prompt    string    `json:"prompt"`
	CWD       string    `json:"cwd"`
	Model     string    `json:"model"`
	Mentions  []Mention `json:"mentions"`
	NoContext bool      `json:"no_context,omitempty"`
	// Effort controls the reasoning effort level passed to the CLI via
	// --effort <level>. Empty string means "don't pass the flag" (auto).
	Effort    string    `json:"effort,omitempty"`
}
