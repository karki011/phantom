// Package provider defines the normalized interfaces and types for
// AI tool integrations in Phantom OS v2.
//
// The architecture uses 5 focused interfaces (Interface Segregation Principle)
// composed into a single Provider interface. Each AI tool (Claude, Codex, Gemini)
// implements Provider via a Go adapter that embeds ConfigProvider for config-driven
// defaults and overrides only the methods that need custom logic.
//
// Author: Subash Karki
// Date: 2026-04-26
package provider

import (
	"context"
	"io"
	"time"
)

// ---------------------------------------------------------------------------
// Message types — normalized across all providers
// ---------------------------------------------------------------------------

// MessageType represents a normalized message role.
type MessageType string

const (
	MessageUser       MessageType = "user"
	MessageAssistant  MessageType = "assistant"
	MessageToolUse    MessageType = "tool_use"
	MessageToolResult MessageType = "tool_result"
	MessageSystem     MessageType = "system"
	MessageThinking   MessageType = "thinking"
	MessageError      MessageType = "error"
)

// PromptTransport describes how prompts are passed to a CLI tool.
type PromptTransport string

const (
	PromptArgv   PromptTransport = "argv"
	PromptStdin  PromptTransport = "stdin"
	PromptFile   PromptTransport = "file"
	PromptSocket PromptTransport = "socket"
)

// ---------------------------------------------------------------------------
// Normalized data types
// ---------------------------------------------------------------------------

// RawSession is the provider-agnostic representation of a discovered session.
type RawSession struct {
	ID        string    `json:"id"`
	Provider  string    `json:"provider"`
	PID       int       `json:"pid,omitempty"`
	CWD       string    `json:"cwd"`
	Model     string    `json:"model,omitempty"`
	StartedAt time.Time `json:"started_at"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
	Name      string    `json:"name,omitempty"`
	Kind      string    `json:"kind,omitempty"`
	Status    string    `json:"status,omitempty"`
	// GitBranch is populated by providers that track git context (e.g. Codex).
	GitBranch string `json:"git_branch,omitempty"`
	// GitSHA is populated by providers that track git context (e.g. Codex).
	GitSHA string `json:"git_sha,omitempty"`
}

// TokenUsage is the normalized token usage across all providers.
// Fields are int64 to accommodate large token counts without overflow.
type TokenUsage struct {
	Input      int64 `json:"input"`
	Output     int64 `json:"output"`
	CacheRead  int64 `json:"cache_read,omitempty"`
	CacheWrite int64 `json:"cache_write,omitempty"`
	Thinking   int64 `json:"thinking,omitempty"`
	Tool       int64 `json:"tool,omitempty"`
	Total      int64 `json:"total,omitempty"`
}

// ComputedTotal returns Total if set, otherwise sums all fields.
func (u TokenUsage) ComputedTotal() int64 {
	if u.Total > 0 {
		return u.Total
	}
	return u.Input + u.Output + u.CacheRead + u.CacheWrite + u.Thinking + u.Tool
}

// ToolCall represents a single tool invocation within a message.
type ToolCall struct {
	ID     string `json:"id,omitempty"`
	Name   string `json:"name"`
	Args   any    `json:"args,omitempty"`
	Result any    `json:"result,omitempty"`
	Status string `json:"status,omitempty"`
}

// Thought represents a thinking/reasoning block within a message.
type Thought struct {
	Subject     string    `json:"subject,omitempty"`
	Description string    `json:"description"`
	Timestamp   time.Time `json:"timestamp,omitempty"`
}

// Message is the normalized representation of a single conversation turn.
type Message struct {
	ID        string      `json:"id,omitempty"`
	Type      MessageType `json:"type"`
	Content   string      `json:"content"`
	Timestamp time.Time   `json:"timestamp,omitempty"`
	Model     string      `json:"model,omitempty"`
	Usage     *TokenUsage `json:"usage,omitempty"`
	ToolCalls []ToolCall  `json:"tool_calls,omitempty"`
	Thoughts  []Thought   `json:"thoughts,omitempty"`
}

// ConversationData is the normalized representation of a full conversation.
type ConversationData struct {
	SessionID  string       `json:"session_id"`
	Provider   string       `json:"provider"`
	Messages   []Message    `json:"messages"`
	TotalUsage *TokenUsage  `json:"total_usage,omitempty"`
	StartTime  time.Time    `json:"start_time,omitempty"`
	EndTime    time.Time    `json:"end_time,omitempty"`
}

// HealthStatus describes the health of a provider installation.
type HealthStatus struct {
	Installed bool   `json:"installed"`
	Reachable bool   `json:"reachable"` // CLI responds to --version
	HasAuth   bool   `json:"has_auth"`  // Credentials found
	Version   string `json:"version,omitempty"`
	Error     string `json:"error,omitempty"`
}

// ---------------------------------------------------------------------------
// 5 Focused Interfaces (Interface Segregation Principle)
// ---------------------------------------------------------------------------

// ProviderIdentity answers "who is this provider?" — purely informational,
// driven entirely by YAML config. No I/O required.
type ProviderIdentity interface {
	Name() string
	DisplayName() string
	Icon() string
	Enabled() bool
	IsInstalled() bool
	DetectedVersion() string
}

// SessionDiscoverer knows how to find and check sessions for a provider.
// Config-driven for simple JSON/glob discovery; Go adapter for SQLite or
// dual-discovery (e.g. Codex).
type SessionDiscoverer interface {
	DiscoverSessions(ctx context.Context) ([]RawSession, error)
	IsSessionAlive(session RawSession) bool
}

// ConversationParser reads and normalizes conversation data.
// Almost always requires a Go adapter because each provider's content
// structure is fundamentally different.
type ConversationParser interface {
	FindConversationFile(sessionID, cwd string) (string, error)
	ParseConversation(r io.Reader) (*ConversationData, error)
}

// CostCalculator computes token costs from usage data.
// Config-driven: reads pricing tiers from YAML and matches against model name.
type CostCalculator interface {
	// ParseUsage extracts a normalized TokenUsage from a raw JSON map.
	ParseUsage(raw map[string]any) *TokenUsage
	// CalculateCost returns the cost in microdollars (1 USD = 1_000_000).
	CalculateCost(model string, usage TokenUsage) int64
}

// CommandRunner knows how to invoke the provider's CLI.
// Config-driven: interpolates variables into command templates from YAML.
type CommandRunner interface {
	ResumeCommand(sessionID string) string
	NewSessionCommand(cwd string) string
	AIGenerateCommand(prompt string) string
	PromptTransport() PromptTransport

	// SupportsFork reports whether the provider can clone a session transcript
	// to a new session ID. Defaults to false; Claude returns true.
	SupportsFork() bool

	// ForkConversation clones an existing session's on-disk transcript to a
	// new session ID under the same encoded-CWD directory. Implementations
	// must avoid watcher truncation races by writing to a temp file first
	// and atomically renaming into place. The returned newSessionID is a
	// freshly generated UUID. cwd is the original session's working
	// directory used to locate the source transcript; newName is reserved
	// for future use (e.g. embedding a friendly name in the transcript).
	ForkConversation(sessionID, cwd, newName string) (newSessionID string, err error)
}

// PathResolver provides access to the provider's filesystem paths.
// Each method returns the expanded (absolute) path for the given directory
// or file.
type PathResolver interface {
	SessionsDir() string
	ConversationsDir() string
	TodosDir() string
	TasksDir() string
	ContextDir() string
	SettingsFile() string
}

// ---------------------------------------------------------------------------
// Composed Provider Interface
// ---------------------------------------------------------------------------

// Provider composes all 6 focused interfaces plus a health check method.
// Every AI tool integration must satisfy this interface, either via a
// pure ConfigProvider (YAML-only) or a Go adapter that embeds ConfigProvider
// and overrides specific methods.
type Provider interface {
	ProviderIdentity
	SessionDiscoverer
	ConversationParser
	CostCalculator
	CommandRunner
	PathResolver

	// HealthCheck performs a full liveness probe: binary exists, CLI responds,
	// credentials are available.
	HealthCheck(ctx context.Context) HealthStatus

	// ExecutablePath resolves the absolute path to the provider's CLI binary
	// on the current PATH. Returns an error if the binary is not installed.
	ExecutablePath() (string, error)
}
