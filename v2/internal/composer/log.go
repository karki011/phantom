// Author: Subash Karki
package composer

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// LogLevel controls severity filtering.
type LogLevel string

const (
	LogDebug LogLevel = "debug"
	LogInfo  LogLevel = "info"
	LogWarn  LogLevel = "warn"
	LogError LogLevel = "error"
)

// LogEntry is a single structured log line written as NDJSON.
type LogEntry struct {
	Timestamp  string          `json:"ts"`
	Level      LogLevel        `json:"level"`
	Category   string          `json:"category"`
	SessionID  string          `json:"sessionId,omitempty"`
	WorktreeID string          `json:"worktreeId,omitempty"`
	Kind       string          `json:"kind,omitempty"`
	Msg        string          `json:"msg"`
	Data       json.RawMessage `json:"data,omitempty"`
}

// ── Rich log data structs ────────────────────────────────────────────

// systemInitLogData captures the session init metadata.
type systemInitLogData struct {
	SessionID       string   `json:"session_id,omitempty"`
	Model           string   `json:"model,omitempty"`
	Tools           []string `json:"tools,omitempty"`
	ToolCount       int      `json:"tool_count"`
	MCPServers      []string `json:"mcp_servers,omitempty"`
	Version         string   `json:"claude_code_version,omitempty"`
	PermissionMode  string   `json:"permission_mode,omitempty"`
}

// systemStatusLogData captures system status updates.
type systemStatusLogData struct {
	Status         string `json:"status,omitempty"`
	PermissionMode string `json:"permission_mode,omitempty"`
}

// systemHookLogData captures hook lifecycle events.
type systemHookLogData struct {
	HookName  string `json:"hook_name,omitempty"`
	HookEvent string `json:"hook_event,omitempty"`
	ExitCode  int    `json:"exit_code,omitempty"`
	Outcome   string `json:"outcome,omitempty"`
}

// assistantLogData captures a complete assistant message's metadata.
type assistantLogData struct {
	Model         string `json:"model,omitempty"`
	StopReason    string `json:"stop_reason,omitempty"`
	InputTokens   int    `json:"input_tokens"`
	OutputTokens  int    `json:"output_tokens"`
	CacheReadTokens  int `json:"cache_read_tokens,omitempty"`
	CacheWriteTokens int `json:"cache_write_tokens,omitempty"`
	ContentBlocks int    `json:"content_blocks"`
	ToolUseCount  int    `json:"tool_use_count"`
}

// resultLogData captures the final result summary.
type resultLogData struct {
	DurationMs    int64    `json:"duration_ms,omitempty"`
	DurationApiMs int64   `json:"duration_api_ms,omitempty"`
	NumTurns      int      `json:"num_turns,omitempty"`
	TotalCostUsd  float64  `json:"total_cost_usd,omitempty"`
	InputTokens   int      `json:"input_tokens,omitempty"`
	OutputTokens  int      `json:"output_tokens,omitempty"`
	StopReason    string   `json:"stop_reason,omitempty"`
	Errors        []string `json:"errors,omitempty"`
}

// permissionLogData captures permission request/response metadata.
type permissionLogData struct {
	ToolName     string `json:"tool_name,omitempty"`
	Description  string `json:"description,omitempty"`
	ToolUseID    string `json:"tool_use_id,omitempty"`
	InputSummary string `json:"input_summary,omitempty"`
	RequestID    string `json:"request_id,omitempty"`
	Allowed      *bool  `json:"allowed,omitempty"`
}

// streamEventLogData captures partial message deltas (DEBUG only).
type streamEventLogData struct {
	EventType string `json:"event_type,omitempty"`
	ByteCount int    `json:"byte_count"`
}

// userReplayLogData captures user message replay metadata.
type userReplayLogData struct {
	ContentLength    int  `json:"content_length"`
	HasEditorContext bool `json:"has_editor_context,omitempty"`
}

// sessionLifecycleLogData captures session spawn/stop/crash metadata.
type sessionLifecycleLogData struct {
	PID      int      `json:"pid,omitempty"`
	CWD      string   `json:"cwd,omitempty"`
	Args     []string `json:"args,omitempty"`
	Reason   string   `json:"reason,omitempty"`
	ExitCode int      `json:"exit_code,omitempty"`
}

// ── Logger ───────────────────────────────────────────────────────────

// ComposerLogger writes structured NDJSON logs for composer sessions.
type ComposerLogger struct {
	mu      sync.Mutex
	file    *os.File
	enc     *json.Encoder
	verbose bool
}

// NewComposerLogger creates a logger that appends to <logDir>/composer.ndjson.
// The directory is created if it does not exist.
func NewComposerLogger(logDir string, verbose bool) (*ComposerLogger, error) {
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, fmt.Errorf("create log dir: %w", err)
	}

	path := filepath.Join(logDir, "composer.ndjson")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open log file: %w", err)
	}

	return &ComposerLogger{
		file:    f,
		enc:     json.NewEncoder(f),
		verbose: verbose,
	}, nil
}

// Log writes a structured entry. DEBUG entries are skipped when verbose is false.
func (l *ComposerLogger) Log(level LogLevel, category, sessionID, msg string, data any) {
	if level == LogDebug && !l.verbose {
		return
	}

	entry := LogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level,
		Category:  category,
		SessionID: sessionID,
		Msg:       msg,
	}

	if data != nil {
		raw, err := json.Marshal(data)
		if err == nil {
			entry.Data = raw
		}
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	_ = l.enc.Encode(entry)
}

// ── Event logging with rich extraction ───────────────────────────────

// eventLogLevel maps a StreamEvent kind to the appropriate log level.
func eventLogLevel(ev StreamEvent) LogLevel {
	switch ev.Kind {
	case EventSystemInit:
		return LogInfo
	case EventAssistant:
		return LogInfo
	case EventResultSuccess:
		return LogInfo
	case EventResultError:
		return LogError
	case EventControlRequest, EventControlResponse:
		return LogInfo
	case EventSessionStatus:
		return LogInfo
	case EventError:
		if ev.RawType == "stderr" {
			return LogWarn
		}
		return LogError
	case EventStreamEvent:
		return LogDebug
	case EventUserReplay:
		return LogDebug
	case EventSystemStatus:
		// Hook events with non-zero exit → WARN, else DEBUG.
		if ev.RawSubtype == "hook_started" || ev.RawSubtype == "hook_response" {
			return hookLogLevel(ev)
		}
		return LogDebug

	// Legacy aliases
	case EventPermissionRequest, EventPermissionResponse,
		EventToolUseStart, EventToolUseComplete, EventToolResult:
		return LogInfo

	default:
		return LogDebug
	}
}

// hookLogLevel returns WARN if a hook had a non-zero exit code, else DEBUG.
func hookLogLevel(ev StreamEvent) LogLevel {
	if len(ev.Raw) == 0 {
		return LogDebug
	}
	var raw struct {
		ExitCode int `json:"exit_code"`
	}
	if json.Unmarshal(ev.Raw, &raw) == nil && raw.ExitCode != 0 {
		return LogWarn
	}
	return LogDebug
}

// LogEvent writes a structured entry for a stream event, extracting rich
// metadata per event type. Tool input content is truncated to 200 chars
// at INFO level to respect privacy boundaries.
func (l *ComposerLogger) LogEvent(sessionID string, ev StreamEvent) {
	level := eventLogLevel(ev)
	if level == LogDebug && !l.verbose {
		return
	}

	switch ev.Kind {
	case EventSystemInit:
		l.logSystemInit(sessionID, ev, level)
	case EventSystemStatus:
		if ev.RawSubtype == "hook_started" || ev.RawSubtype == "hook_response" {
			l.logSystemHook(sessionID, ev, level)
		} else {
			l.logSystemStatus(sessionID, ev, level)
		}
	case EventAssistant:
		l.logAssistantMessage(sessionID, ev, level)
	case EventResultSuccess:
		l.logResult(sessionID, ev, level, false)
	case EventResultError:
		l.logResult(sessionID, ev, level, true)
	case EventControlRequest:
		l.logControlRequest(sessionID, ev, level)
	case EventControlResponse:
		l.logControlResponse(sessionID, ev, level)
	case EventStreamEvent:
		l.logStreamDelta(sessionID, ev, level)
	case EventUserReplay:
		l.logUserReplay(sessionID, ev, level)
	case EventSessionStatus:
		l.logEntry(level, "event", sessionID, string(ev.Kind), "session_status_changed: "+ev.Text, nil)
	case EventError:
		l.logEntry(level, "event", sessionID, string(ev.Kind), ev.Text, nil)
	default:
		// Legacy and unknown events — preserve basic tool metadata.
		l.logLegacyEvent(sessionID, ev, level)
	}
}

// ── Per-event-type log helpers ───────────────────────────────────────

func (l *ComposerLogger) logSystemInit(sessionID string, ev StreamEvent, level LogLevel) {
	data := systemInitLogData{}

	if len(ev.Raw) > 0 {
		var raw struct {
			SessionID      string   `json:"session_id"`
			Model          string   `json:"model"`
			Tools          []string `json:"tools"`
			MCPServers     []string `json:"mcp_servers"`
			Version        string   `json:"claude_code_version"`
			PermissionMode string   `json:"permissionMode"`
		}
		if json.Unmarshal(ev.Raw, &raw) == nil {
			data.SessionID = raw.SessionID
			data.Model = raw.Model
			data.Tools = raw.Tools
			data.ToolCount = len(raw.Tools)
			data.MCPServers = raw.MCPServers
			data.Version = raw.Version
			data.PermissionMode = raw.PermissionMode
		}
	}

	// Fallback: use session_id from the event itself.
	if data.SessionID == "" && ev.SessionID != "" {
		data.SessionID = ev.SessionID
	}

	msg := "session initialized"
	if data.Model != "" {
		msg = fmt.Sprintf("session initialized (model=%s, tools=%d)", data.Model, data.ToolCount)
	}

	l.logEntry(level, "event", sessionID, string(ev.Kind), msg, data)
}

func (l *ComposerLogger) logSystemStatus(sessionID string, ev StreamEvent, level LogLevel) {
	data := systemStatusLogData{}

	if len(ev.Raw) > 0 {
		var raw struct {
			Status         string `json:"status"`
			PermissionMode string `json:"permissionMode"`
		}
		if json.Unmarshal(ev.Raw, &raw) == nil {
			data.Status = raw.Status
			data.PermissionMode = raw.PermissionMode
		}
	}

	msg := "system status"
	if data.Status != "" {
		msg = "system status: " + data.Status
	}

	l.logEntry(level, "event", sessionID, string(ev.Kind), msg, data)
}

func (l *ComposerLogger) logSystemHook(sessionID string, ev StreamEvent, level LogLevel) {
	data := systemHookLogData{}

	if len(ev.Raw) > 0 {
		var raw struct {
			HookName  string `json:"hook_name"`
			HookEvent string `json:"hook_event"`
			ExitCode  int    `json:"exit_code"`
			Outcome   string `json:"outcome"`
		}
		if json.Unmarshal(ev.Raw, &raw) == nil {
			data.HookName = raw.HookName
			data.HookEvent = raw.HookEvent
			data.ExitCode = raw.ExitCode
			data.Outcome = raw.Outcome
		}
	}

	msg := "hook " + ev.RawSubtype
	if data.HookName != "" {
		msg = fmt.Sprintf("hook %s: %s", ev.RawSubtype, data.HookName)
	}

	l.logEntry(level, "event", sessionID, string(ev.Kind), msg, data)
}

func (l *ComposerLogger) logAssistantMessage(sessionID string, ev StreamEvent, level LogLevel) {
	data := assistantLogData{}

	if len(ev.Message) > 0 {
		var msg struct {
			Model      string `json:"model"`
			StopReason string `json:"stop_reason"`
			Usage      struct {
				InputTokens      int `json:"input_tokens"`
				OutputTokens     int `json:"output_tokens"`
				CacheReadTokens  int `json:"cache_read_input_tokens"`
				CacheWriteTokens int `json:"cache_creation_input_tokens"`
			} `json:"usage"`
			Content []struct {
				Type string `json:"type"`
			} `json:"content"`
		}
		if json.Unmarshal(ev.Message, &msg) == nil {
			data.Model = msg.Model
			data.StopReason = msg.StopReason
			data.InputTokens = msg.Usage.InputTokens
			data.OutputTokens = msg.Usage.OutputTokens
			data.CacheReadTokens = msg.Usage.CacheReadTokens
			data.CacheWriteTokens = msg.Usage.CacheWriteTokens
			data.ContentBlocks = len(msg.Content)
			for _, c := range msg.Content {
				if c.Type == "tool_use" {
					data.ToolUseCount++
				}
			}
		}
	}

	logMsg := fmt.Sprintf("assistant message (in=%d out=%d blocks=%d tools=%d)",
		data.InputTokens, data.OutputTokens, data.ContentBlocks, data.ToolUseCount)

	l.logEntry(level, "event", sessionID, string(ev.Kind), logMsg, data)
}

func (l *ComposerLogger) logResult(sessionID string, ev StreamEvent, level LogLevel, isError bool) {
	data := resultLogData{
		DurationMs: ev.DurationMs,
	}

	if len(ev.Raw) > 0 {
		var raw struct {
			DurationMs    int64   `json:"duration_ms"`
			DurationApiMs int64   `json:"duration_api_ms"`
			NumTurns      int     `json:"num_turns"`
			TotalCostUsd  float64 `json:"total_cost_usd"`
			Usage         struct {
				InputTokens  int `json:"input_tokens"`
				OutputTokens int `json:"output_tokens"`
			} `json:"usage"`
			StopReason string   `json:"terminal_reason"`
			Errors     []string `json:"errors"`
			// Error can also be a single string.
			Error string `json:"error"`
		}
		if json.Unmarshal(ev.Raw, &raw) == nil {
			if raw.DurationMs > 0 {
				data.DurationMs = raw.DurationMs
			}
			data.DurationApiMs = raw.DurationApiMs
			data.NumTurns = raw.NumTurns
			data.TotalCostUsd = raw.TotalCostUsd
			data.InputTokens = raw.Usage.InputTokens
			data.OutputTokens = raw.Usage.OutputTokens
			data.StopReason = raw.StopReason
			data.Errors = raw.Errors
			if raw.Error != "" && len(data.Errors) == 0 {
				data.Errors = []string{raw.Error}
			}
		}
	}

	if isError {
		msg := "session ended with error"
		if len(data.Errors) > 0 {
			msg = fmt.Sprintf("session error: %s", data.Errors[0])
		}
		l.logEntry(level, "event", sessionID, string(ev.Kind), msg, data)
	} else {
		msg := fmt.Sprintf("session completed (turns=%d cost=$%.4f duration=%dms)",
			data.NumTurns, data.TotalCostUsd, data.DurationMs)
		l.logEntry(level, "event", sessionID, string(ev.Kind), msg, data)
	}
}

func (l *ComposerLogger) logControlRequest(sessionID string, ev StreamEvent, level LogLevel) {
	data := permissionLogData{
		ToolName:    ev.ToolName,
		Description: ev.Description,
		ToolUseID:   ev.ToolUseID,
		RequestID:   ev.RequestID,
	}

	// Summarize tool input (first 200 chars for privacy).
	if len(ev.ToolInput) > 0 {
		inputStr := string(ev.ToolInput)
		if len(inputStr) > 200 {
			inputStr = inputStr[:200] + "..."
		}
		data.InputSummary = inputStr
	}

	msg := "permission requested"
	if data.ToolName != "" {
		msg = fmt.Sprintf("permission requested: %s", data.ToolName)
	}

	l.logEntry(level, "event", sessionID, string(ev.Kind), msg, data)
}

func (l *ComposerLogger) logControlResponse(sessionID string, ev StreamEvent, level LogLevel) {
	data := permissionLogData{
		RequestID: ev.RequestID,
	}

	if len(ev.Response) > 0 {
		var resp struct {
			Allowed bool `json:"allowed"`
		}
		if json.Unmarshal(ev.Response, &resp) == nil {
			data.Allowed = &resp.Allowed
		}
	}

	msg := "permission response"
	if data.Allowed != nil {
		if *data.Allowed {
			msg = "permission granted"
		} else {
			msg = "permission denied"
		}
	}

	l.logEntry(level, "event", sessionID, string(ev.Kind), msg, data)
}

func (l *ComposerLogger) logStreamDelta(sessionID string, ev StreamEvent, level LogLevel) {
	data := streamEventLogData{
		EventType: ev.RawSubtype,
		ByteCount: len(ev.Raw),
	}

	l.logEntry(level, "event", sessionID, string(ev.Kind), "stream delta", data)
}

func (l *ComposerLogger) logUserReplay(sessionID string, ev StreamEvent, level LogLevel) {
	data := userReplayLogData{
		ContentLength: len(ev.Raw),
	}

	// Check if there's editor context in the raw payload.
	if len(ev.Raw) > 0 {
		var raw struct {
			EditorContext json.RawMessage `json:"editor_context"`
		}
		if json.Unmarshal(ev.Raw, &raw) == nil && len(raw.EditorContext) > 0 {
			data.HasEditorContext = true
		}
	}

	l.logEntry(level, "event", sessionID, string(ev.Kind), "user message replay", data)
}

func (l *ComposerLogger) logLegacyEvent(sessionID string, ev StreamEvent, level LogLevel) {
	msg := string(ev.Kind)
	if ev.Text != "" {
		msg = ev.Text
	}

	// Attach tool metadata when available (legacy path).
	type toolMeta struct {
		ToolName   string          `json:"toolName,omitempty"`
		ToolUseID  string          `json:"toolUseId,omitempty"`
		ToolInput  json.RawMessage `json:"toolInput,omitempty"`
		ToolOutput string          `json:"toolOutput,omitempty"`
		IsError    bool            `json:"isError,omitempty"`
	}

	meta := toolMeta{
		ToolName:   ev.ToolName,
		ToolUseID:  ev.ToolUseID,
		ToolInput:  ev.ToolInput,
		ToolOutput: ev.ToolOutput,
		IsError:    ev.IsError,
	}

	var data any
	if meta.ToolName != "" || meta.ToolUseID != "" || meta.IsError {
		data = meta
	}

	l.logEntry(level, "event", sessionID, string(ev.Kind), msg, data)
}

// logEntry is the common write path for all event log helpers.
func (l *ComposerLogger) logEntry(level LogLevel, category, sessionID, kind, msg string, data any) {
	entry := LogEntry{
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level,
		Category:  category,
		SessionID: sessionID,
		Kind:      kind,
		Msg:       msg,
	}

	if data != nil {
		raw, err := json.Marshal(data)
		if err == nil {
			entry.Data = raw
		}
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	_ = l.enc.Encode(entry)
}

// Close flushes and closes the underlying log file.
func (l *ComposerLogger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file != nil {
		return l.file.Close()
	}
	return nil
}
