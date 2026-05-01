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
	Type      string `json:"type"` // "delta" | "thinking" | "tool_use" | "result" | "done" | "error" | "strategy"
	Content   string `json:"content,omitempty"`
	ToolName  string `json:"tool_name,omitempty"`
	ToolInput string `json:"tool_input,omitempty"`

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
	SessionID    string  `json:"session_id"`
	FirstPaneID  string  `json:"first_pane_id"`  // any pane that touched the session
	FirstPrompt  string  `json:"first_prompt"`   // truncated to 200 chars
	TurnCount    int     `json:"turn_count"`
	LastActivity int64   `json:"last_activity"`  // unix seconds
	TotalCost    float64 `json:"total_cost"`
	Cwd          string  `json:"cwd"`            // first non-empty cwd seen
}

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
