// Package codex implements the CodexProvider adapter for Phantom OS v2.
//
// CodexProvider embeds ConfigProvider and overrides methods that require
// Codex-specific logic:
//   - DiscoverSessions: dual strategy (SQLite primary, JSONL index fallback)
//   - FindConversationFile: date-nested path convention (YYYY/MM/DD/)
//   - ParseConversation: OpenAI event schema (session_meta, event_msg, response_item, turn_context)
//   - ParseUsage: OpenAI token fields (prompt_tokens, completion_tokens, total_tokens)
//
// Author: Subash Karki
// Date: 2026-04-26
package codex

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/provider"

	// Pure-Go SQLite driver — already in go.mod, no CGO required.
	_ "modernc.org/sqlite"
)

// CodexProvider is the OpenAI Codex CLI adapter. It embeds ConfigProvider for
// config-driven defaults and overrides DiscoverSessions, FindConversationFile,
// ParseConversation, and ParseUsage with Codex-specific logic.
type CodexProvider struct {
	*provider.ConfigProvider
}

// New creates a CodexProvider from a loaded ProviderConfig.
func New(cfg *provider.ProviderConfig) *CodexProvider {
	return &CodexProvider{ConfigProvider: provider.NewConfigProvider(cfg)}
}

// ---------------------------------------------------------------------------
// DiscoverSessions — dual strategy: SQLite primary, JSONL index fallback
// ---------------------------------------------------------------------------

// DiscoverSessions finds Codex sessions using a dual strategy:
//  1. Primary: query the SQLite database (~/.codex/state_5.sqlite) for the
//     threads table which contains rich metadata (model, tokens, git info).
//  2. Fallback: if SQLite fails, read the JSONL index (~/.codex/session_index.jsonl)
//     which has minimal fields (id, thread_name, updated_at).
func (cp *CodexProvider) DiscoverSessions(ctx context.Context) ([]provider.RawSession, error) {
	sessions, err := cp.discoverFromSQLite(ctx)
	if err == nil {
		return sessions, nil
	}

	// SQLite failed — try JSONL index fallback.
	sessions, jsonlErr := cp.discoverFromJSONLIndex()
	if jsonlErr != nil {
		return nil, fmt.Errorf("sqlite: %w; jsonl fallback: %v", err, jsonlErr)
	}
	return sessions, nil
}

// discoverFromSQLite queries the Codex SQLite database for session data.
func (cp *CodexProvider) discoverFromSQLite(_ context.Context) ([]provider.RawSession, error) {
	sqliteCfg := cp.Cfg.Sessions.SQLite
	if sqliteCfg == nil {
		return nil, fmt.Errorf("no sqlite config")
	}

	dbPath := provider.ExpandPath(sqliteCfg.Path)
	if _, err := os.Stat(dbPath); err != nil {
		return nil, fmt.Errorf("sqlite db not found: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	defer db.Close()

	query := fmt.Sprintf(
		"SELECT id, cwd, model, title, tokens_used, source, git_sha, git_branch, created_at, updated_at FROM %s ORDER BY updated_at DESC",
		sqliteCfg.Table,
	)

	rows, err := db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query threads: %w", err)
	}
	defer rows.Close()

	var sessions []provider.RawSession
	for rows.Next() {
		var (
			id, cwd, model, title, source, gitSHA, gitBranch sql.NullString
			tokensUsed                                        sql.NullInt64
			createdAt, updatedAt                              sql.NullString
		)

		if err := rows.Scan(&id, &cwd, &model, &title, &tokensUsed, &source, &gitSHA, &gitBranch, &createdAt, &updatedAt); err != nil {
			continue // skip unreadable rows
		}

		sess := provider.RawSession{
			Provider: cp.Name(),
		}

		if id.Valid {
			sess.ID = id.String
		}
		if cwd.Valid {
			sess.CWD = cwd.String
		}
		if model.Valid {
			sess.Model = model.String
		}
		if title.Valid {
			sess.Name = title.String
		}
		if source.Valid {
			sess.Kind = source.String
		}
		if gitSHA.Valid {
			sess.GitSHA = gitSHA.String
		}
		if gitBranch.Valid {
			sess.GitBranch = gitBranch.String
		}
		if createdAt.Valid {
			if t, err := parseFlexibleTime(createdAt.String); err == nil {
				sess.StartedAt = t
			}
		}
		if updatedAt.Valid {
			if t, err := parseFlexibleTime(updatedAt.String); err == nil {
				sess.UpdatedAt = t
			}
		}

		sessions = append(sessions, sess)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}

	return sessions, nil
}

// discoverFromJSONLIndex reads the JSONL session index as a fallback.
func (cp *CodexProvider) discoverFromJSONLIndex() ([]provider.RawSession, error) {
	jsonlCfg := cp.Cfg.Sessions.JSONLIndex
	if jsonlCfg == nil {
		return nil, fmt.Errorf("no jsonl_index config")
	}

	indexPath := provider.ExpandPath(jsonlCfg.Path)
	f, err := os.Open(indexPath)
	if err != nil {
		return nil, fmt.Errorf("open jsonl index: %w", err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	fields := jsonlCfg.Fields
	var sessions []provider.RawSession

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var raw map[string]any
		if err := json.Unmarshal(line, &raw); err != nil {
			continue
		}

		sess := provider.RawSession{
			Provider: cp.Name(),
		}

		if idKey, ok := fields["id"]; ok {
			if v, ok := raw[idKey]; ok {
				sess.ID = fmt.Sprintf("%v", v)
			}
		}
		if nameKey, ok := fields["name"]; ok {
			if v, ok := raw[nameKey]; ok {
				sess.Name = fmt.Sprintf("%v", v)
			}
		}
		if updatedKey, ok := fields["updated_at"]; ok {
			if v, ok := raw[updatedKey]; ok {
				if s, ok := v.(string); ok {
					if t, err := parseFlexibleTime(s); err == nil {
						sess.UpdatedAt = t
					}
				}
			}
		}

		if sess.ID != "" {
			sessions = append(sessions, sess)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan jsonl index: %w", err)
	}

	return sessions, nil
}

// ---------------------------------------------------------------------------
// FindConversationFile — date-nested path convention
// ---------------------------------------------------------------------------

// FindConversationFile locates the JSONL conversation file for a Codex session.
//
// Codex stores conversations in a date-nested structure:
//
//	~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl
//
// The strategy is to walk the sessions directory recursively and find a file
// whose name ends with "-<sessionID>.jsonl". The cwd parameter is unused for
// Codex since files are organized by date, not by project directory.
func (cp *CodexProvider) FindConversationFile(sessionID, _ string) (string, error) {
	if sessionID == "" {
		return "", fmt.Errorf("sessionID is required")
	}

	convDir := cp.ConversationsDir()
	suffix := "-" + sessionID + ".jsonl"

	var found string
	err := filepath.WalkDir(convDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable dirs
		}
		if d.IsDir() {
			return nil
		}
		if strings.HasSuffix(d.Name(), suffix) {
			found = path
			return filepath.SkipAll
		}
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("walk conversations dir: %w", err)
	}
	if found == "" {
		return "", fmt.Errorf("conversation file for session %s not found in %s", sessionID, convDir)
	}
	return found, nil
}

// ---------------------------------------------------------------------------
// ParseConversation — OpenAI event schema
// ---------------------------------------------------------------------------

// codexLine represents the raw JSON shape of a single JSONL line in Codex
// conversation logs.
type codexLine struct {
	Timestamp string         `json:"timestamp"`
	Type      string         `json:"type"`
	Payload   map[string]any `json:"payload"`
}

// ParseConversation reads a Codex JSONL conversation from the given reader
// and returns normalized ConversationData.
//
// It handles Codex's event types:
//   - session_meta: session info (id, cwd, model_provider, git context)
//   - event_msg: user messages and system events (via payload.type)
//   - response_item: assistant messages with optional usage data
//   - turn_context: context/system messages with model info
func (cp *CodexProvider) ParseConversation(r io.Reader) (*provider.ConversationData, error) {
	scanner := bufio.NewScanner(r)
	// 10MB max: response items can contain large tool outputs
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

	conv := &provider.ConversationData{
		Provider: cp.Name(),
	}

	var totalUsage provider.TokenUsage

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var entry codexLine
		if err := json.Unmarshal(line, &entry); err != nil {
			continue // skip malformed lines
		}

		msg := cp.classifyEntry(&entry)
		if msg == nil {
			continue
		}

		// Parse timestamp
		if entry.Timestamp != "" {
			if t, err := time.Parse(time.RFC3339Nano, entry.Timestamp); err == nil {
				msg.Timestamp = t
			}
		}

		// Accumulate usage
		if msg.Usage != nil {
			totalUsage.Input += msg.Usage.Input
			totalUsage.Output += msg.Usage.Output
			totalUsage.Total += msg.Usage.Total
		}

		conv.Messages = append(conv.Messages, *msg)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan JSONL: %w", err)
	}

	if totalUsage.ComputedTotal() > 0 {
		conv.TotalUsage = &totalUsage
	}

	// Set session ID from first session_meta message
	for _, m := range conv.Messages {
		if m.Type == provider.MessageType("session_meta") && m.ID != "" {
			conv.SessionID = m.ID
			break
		}
	}

	// Set start/end times
	if len(conv.Messages) > 0 {
		if !conv.Messages[0].Timestamp.IsZero() {
			conv.StartTime = conv.Messages[0].Timestamp
		}
		if !conv.Messages[len(conv.Messages)-1].Timestamp.IsZero() {
			conv.EndTime = conv.Messages[len(conv.Messages)-1].Timestamp
		}
	}

	return conv, nil
}

// classifyEntry converts a raw Codex JSONL entry into a normalized Message.
func (cp *CodexProvider) classifyEntry(entry *codexLine) *provider.Message {
	switch entry.Type {
	case "session_meta":
		return cp.parseSessionMeta(entry)
	case "event_msg":
		return cp.parseEventMsg(entry)
	case "response_item":
		return cp.parseResponseItem(entry)
	case "turn_context":
		return cp.parseTurnContext(entry)
	default:
		return nil
	}
}

// parseSessionMeta extracts session metadata.
func (cp *CodexProvider) parseSessionMeta(entry *codexLine) *provider.Message {
	msg := &provider.Message{
		Type: provider.MessageType("session_meta"),
	}

	if id, ok := entry.Payload["id"]; ok {
		msg.ID = fmt.Sprintf("%v", id)
	}

	// Build a summary content string from metadata
	var parts []string
	if cwd, ok := entry.Payload["cwd"]; ok {
		parts = append(parts, fmt.Sprintf("cwd: %v", cwd))
	}
	if src, ok := entry.Payload["source"]; ok {
		parts = append(parts, fmt.Sprintf("source: %v", src))
	}
	if ver, ok := entry.Payload["cli_version"]; ok {
		parts = append(parts, fmt.Sprintf("cli_version: %v", ver))
	}
	if mp, ok := entry.Payload["model_provider"]; ok {
		parts = append(parts, fmt.Sprintf("model_provider: %v", mp))
	}
	if len(parts) > 0 {
		msg.Content = strings.Join(parts, ", ")
	}

	return msg
}

// parseEventMsg handles user messages and system events.
func (cp *CodexProvider) parseEventMsg(entry *codexLine) *provider.Message {
	msg := &provider.Message{}

	// Check payload.type to determine the specific event kind
	if payloadType, ok := entry.Payload["type"]; ok {
		switch payloadType {
		case "user_message":
			msg.Type = provider.MessageUser
			if content, ok := entry.Payload["content"]; ok {
				msg.Content = fmt.Sprintf("%v", content)
			}
			// Also check for nested text in content array
			if msg.Content == "" {
				if contentArr, ok := entry.Payload["content"].([]any); ok {
					for _, item := range contentArr {
						if m, ok := item.(map[string]any); ok {
							if t, ok := m["text"]; ok {
								msg.Content = fmt.Sprintf("%v", t)
								break
							}
						}
					}
				}
			}
		case "task_started", "task_complete":
			msg.Type = provider.MessageSystem
			msg.Content = fmt.Sprintf("%v", payloadType)
		default:
			// Unknown event_msg subtypes treated as system messages
			msg.Type = provider.MessageSystem
			msg.Content = fmt.Sprintf("%v", payloadType)
		}
	} else {
		// No type field — treat as user message with raw content
		msg.Type = provider.MessageUser
		if content, ok := entry.Payload["content"]; ok {
			msg.Content = fmt.Sprintf("%v", content)
		}
	}

	return msg
}

// parseResponseItem handles assistant messages.
func (cp *CodexProvider) parseResponseItem(entry *codexLine) *provider.Message {
	msg := &provider.Message{
		Type: provider.MessageAssistant,
	}

	// Extract content from payload
	if item, ok := entry.Payload["item"]; ok {
		if itemMap, ok := item.(map[string]any); ok {
			if content, ok := itemMap["content"]; ok {
				msg.Content = extractTextContent(content)
			}
			if model, ok := itemMap["model"]; ok {
				msg.Model = fmt.Sprintf("%v", model)
			}
		}
	}

	// Try top-level content
	if msg.Content == "" {
		if content, ok := entry.Payload["content"]; ok {
			msg.Content = extractTextContent(content)
		}
	}

	// Try top-level model
	if msg.Model == "" {
		if model, ok := entry.Payload["model"]; ok {
			msg.Model = fmt.Sprintf("%v", model)
		}
	}

	// Extract usage from known locations
	usage := cp.extractResponseUsage(entry.Payload)
	if usage != nil && usage.ComputedTotal() > 0 {
		msg.Usage = usage
	}

	// Extract tool calls if present
	if item, ok := entry.Payload["item"]; ok {
		if itemMap, ok := item.(map[string]any); ok {
			if calls, ok := itemMap["tool_calls"]; ok {
				if arr, ok := calls.([]any); ok {
					for _, tc := range arr {
						if tcMap, ok := tc.(map[string]any); ok {
							toolCall := provider.ToolCall{}
							if name, ok := tcMap["name"]; ok {
								toolCall.Name = fmt.Sprintf("%v", name)
							}
							if id, ok := tcMap["id"]; ok {
								toolCall.ID = fmt.Sprintf("%v", id)
							}
							if args, ok := tcMap["arguments"]; ok {
								toolCall.Args = args
							}
							msg.ToolCalls = append(msg.ToolCalls, toolCall)
						}
					}
				}
			}
		}
	}

	return msg
}

// parseTurnContext handles context/system messages.
func (cp *CodexProvider) parseTurnContext(entry *codexLine) *provider.Message {
	msg := &provider.Message{
		Type: provider.MessageSystem,
	}

	if model, ok := entry.Payload["model"]; ok {
		msg.Model = fmt.Sprintf("%v", model)
	}

	if content, ok := entry.Payload["content"]; ok {
		msg.Content = extractTextContent(content)
	}

	// turn_context often carries summary info
	if summary, ok := entry.Payload["summary"]; ok {
		if msg.Content == "" {
			msg.Content = fmt.Sprintf("%v", summary)
		}
	}

	return msg
}

// extractResponseUsage extracts token usage from response_item payloads.
// Searches "usage" and "response.usage" locations.
func (cp *CodexProvider) extractResponseUsage(payload map[string]any) *provider.TokenUsage {
	// Try "usage" directly
	if usageRaw, ok := payload["usage"]; ok {
		if usageMap, ok := usageRaw.(map[string]any); ok {
			return cp.ParseUsage(usageMap)
		}
	}

	// Try "response.usage"
	if resp, ok := payload["response"]; ok {
		if respMap, ok := resp.(map[string]any); ok {
			if usageRaw, ok := respMap["usage"]; ok {
				if usageMap, ok := usageRaw.(map[string]any); ok {
					return cp.ParseUsage(usageMap)
				}
			}
		}
	}

	// Try "item.usage"
	if item, ok := payload["item"]; ok {
		if itemMap, ok := item.(map[string]any); ok {
			if usageRaw, ok := itemMap["usage"]; ok {
				if usageMap, ok := usageRaw.(map[string]any); ok {
					return cp.ParseUsage(usageMap)
				}
			}
		}
	}

	return nil
}

// ---------------------------------------------------------------------------
// ParseUsage — OpenAI token field mapping
// ---------------------------------------------------------------------------

// ParseUsage extracts a normalized TokenUsage from a raw JSON map using
// OpenAI's token field names:
//   - prompt_tokens -> Input
//   - completion_tokens -> Output
//   - total_tokens -> Total
//
// No cache fields for Codex.
func (cp *CodexProvider) ParseUsage(raw map[string]any) *provider.TokenUsage {
	if raw == nil {
		return nil
	}

	usage := &provider.TokenUsage{}

	if v, ok := extractInt64(raw, "prompt_tokens"); ok {
		usage.Input = v
	}
	if v, ok := extractInt64(raw, "completion_tokens"); ok {
		usage.Output = v
	}
	if v, ok := extractInt64(raw, "total_tokens"); ok {
		usage.Total = v
	}

	if usage.ComputedTotal() == 0 {
		return nil
	}

	return usage
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// extractTextContent extracts text from various content representations:
// - string: returned as-is
// - []any: iterates looking for text fields
// - map[string]any: looks for "text" key
func extractTextContent(v any) string {
	switch val := v.(type) {
	case string:
		return val
	case []any:
		var parts []string
		for _, item := range val {
			switch i := item.(type) {
			case string:
				parts = append(parts, i)
			case map[string]any:
				if text, ok := i["text"]; ok {
					parts = append(parts, fmt.Sprintf("%v", text))
				}
			}
		}
		return strings.Join(parts, "\n")
	case map[string]any:
		if text, ok := val["text"]; ok {
			return fmt.Sprintf("%v", text)
		}
	}
	return ""
}

// extractInt64 gets an int64 value from a map by key.
func extractInt64(m map[string]any, key string) (int64, bool) {
	v, ok := m[key]
	if !ok {
		return 0, false
	}
	switch val := v.(type) {
	case float64:
		return int64(val), true
	case int:
		return int64(val), true
	case int64:
		return val, true
	case json.Number:
		if n, err := val.Int64(); err == nil {
			return n, true
		}
	}
	return 0, false
}

// parseFlexibleTime tries multiple time formats commonly used by Codex.
func parseFlexibleTime(s string) (time.Time, error) {
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.000Z",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}

	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unable to parse time: %s", s)
}
