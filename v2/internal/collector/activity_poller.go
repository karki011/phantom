// Package collector — ActivityPoller: real-time activity feed from JSONL files.
// Author: Subash Karki
package collector

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/db"
)

// ActivityPoller polls active sessions' JSONL files every 5 seconds,
// extracts tool calls / git operations / messages, and inserts activity events.
type ActivityPoller struct {
	queries   *db.Queries
	ctx       context.Context
	cancel    context.CancelFunc
	emitEvent func(name string, data interface{})

	mu          sync.Mutex
	fileOffsets map[string]int64 // byte offset per JSONL file path
}

// activityEvent is a single parsed activity entry emitted per poll tick.
type activityEvent struct {
	SessionID string `json:"session_id"`
	Timestamp int64  `json:"timestamp"`
	Type      string `json:"type"`     // tool, git, message, response
	Icon      string `json:"icon"`     // emoji/icon hint for the frontend
	Category  string `json:"category"` // tool | git | message | response
	Detail    string `json:"detail"`   // file path, command, tool name, etc.
}

// NewActivityPoller creates a new ActivityPoller.
func NewActivityPoller(queries *db.Queries, emitEvent func(string, interface{})) *ActivityPoller {
	return &ActivityPoller{
		queries:     queries,
		emitEvent:   emitEvent,
		fileOffsets: make(map[string]int64),
	}
}

func (p *ActivityPoller) Name() string { return "activity-poller" }

func (p *ActivityPoller) Start(ctx context.Context) error {
	p.ctx, p.cancel = context.WithCancel(ctx)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	slog.Info("activity-poller started")

	for {
		select {
		case <-p.ctx.Done():
			slog.Info("activity-poller stopped")
			return nil
		case <-ticker.C:
			p.poll()
		}
	}
}

func (p *ActivityPoller) Stop() error {
	if p.cancel != nil {
		p.cancel()
	}
	return nil
}

// poll iterates active sessions, finds their JSONL files, and processes new bytes.
func (p *ActivityPoller) poll() {
	sessions, err := p.queries.ListActiveSessions(p.ctx)
	if err != nil {
		slog.Error("activity-poller: list active sessions", "err", err)
		return
	}

	var allEvents []activityEvent

	// Track which JSONL paths are still active this tick for cleanup.
	activePaths := make(map[string]struct{}, len(sessions))

	for _, sess := range sessions {
		jsonlPath := p.findJSONLPath(sess)
		if jsonlPath == "" {
			continue
		}
		activePaths[jsonlPath] = struct{}{}

		events := p.readNewLines(jsonlPath, sess.ID)
		allEvents = append(allEvents, events...)
	}

	// Evict fileOffsets for paths that are no longer active so the map
	// doesn't grow without bound as sessions end.
	p.mu.Lock()
	for path := range p.fileOffsets {
		if _, ok := activePaths[path]; !ok {
			delete(p.fileOffsets, path)
		}
	}
	p.mu.Unlock()

	// Cap at 100 events per tick.
	if len(allEvents) > 100 {
		allEvents = allEvents[len(allEvents)-100:]
	}

	// Persist to DB.
	now := time.Now().UnixMilli()
	for _, ev := range allEvents {
		meta, _ := json.Marshal(map[string]string{
			"icon":     ev.Icon,
			"category": ev.Category,
			"detail":   ev.Detail,
		})
		_ = p.queries.InsertActivity(p.ctx, db.InsertActivityParams{
			Timestamp: now,
			Type:      ev.Type,
			SessionID: sql.NullString{String: ev.SessionID, Valid: true},
			Metadata:  sql.NullString{String: string(meta), Valid: true},
		})
	}

	// Emit single Wails event per tick.
	if len(allEvents) > 0 && p.emitEvent != nil {
		p.emitEvent(EventActivity, allEvents)
	}
}

// findJSONLPath returns the most recently modified .jsonl file in the session's
// project directory under ~/.claude/projects/.
func (p *ActivityPoller) findJSONLPath(sess db.Session) string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	// Determine project dir from session's Cwd field.
	cwd := sess.Cwd.String
	if cwd == "" {
		return ""
	}

	// Claude Code stores JSONL under ~/.claude/projects/<encoded-path>/
	encodedPath := strings.ReplaceAll(cwd, "/", "-")
	if strings.HasPrefix(encodedPath, "-") {
		encodedPath = encodedPath[1:]
	}
	projectDir := filepath.Join(home, ".claude", "projects", encodedPath)

	entries, err := os.ReadDir(projectDir)
	if err != nil {
		return ""
	}

	var bestPath string
	var bestMod time.Time

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().After(bestMod) {
			bestMod = info.ModTime()
			bestPath = filepath.Join(projectDir, entry.Name())
		}
	}
	return bestPath
}

// readNewLines reads bytes from the last known offset, parses JSONL lines.
func (p *ActivityPoller) readNewLines(path, sessionID string) []activityEvent {
	p.mu.Lock()
	offset := p.fileOffsets[path]
	p.mu.Unlock()

	f, err := os.Open(path)
	if err != nil {
		slog.Debug("activity-poller: open jsonl", "path", path, "err", err)
		return nil
	}
	defer f.Close()

	// Seek to last known offset.
	if offset > 0 {
		if _, err := f.Seek(offset, io.SeekStart); err != nil {
			slog.Debug("activity-poller: seek", "path", path, "err", err)
			return nil
		}
	}

	var events []activityEvent
	scanner := bufio.NewScanner(f)
	// Allow up to 1 MB per line for large JSONL entries.
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		ev := p.parseLine(line, sessionID)
		if ev != nil {
			events = append(events, *ev)
		}
	}

	// Update offset to current position.
	newOffset, err := f.Seek(0, io.SeekCurrent)
	if err == nil {
		p.mu.Lock()
		p.fileOffsets[path] = newOffset
		p.mu.Unlock()
	}

	return events
}

// Known tool names to detect.
var knownTools = map[string]string{
	"Read":    "📖",
	"Edit":    "✏️",
	"Write":   "📝",
	"Bash":    "💻",
	"Grep":    "🔍",
	"Glob":    "📂",
	"Agent":   "🤖",
	"Skill":   "⚡",
	"WebFetch": "🌐",
}

// Git command patterns.
var gitCmdRegex = regexp.MustCompile(`git\s+(commit|push|checkout|branch|merge|rebase|pull|stash|reset)`)

// parseLine extracts an activity event from a single JSONL line.
func (p *ActivityPoller) parseLine(line []byte, sessionID string) *activityEvent {
	var raw map[string]interface{}
	if err := json.Unmarshal(line, &raw); err != nil {
		return nil
	}

	now := time.Now().UnixMilli()

	// Check for tool use.
	if isToolUse(raw) {
		toolName := extractToolName(raw)
		detail := extractToolDetail(raw, toolName)
		icon, ok := knownTools[toolName]
		if !ok {
			icon = "🔧" // MCP or unknown tool
		}
		return &activityEvent{
			SessionID: sessionID,
			Timestamp: now,
			Type:      fmt.Sprintf("tool:%s", strings.ToLower(toolName)),
			Icon:      icon,
			Category:  "tool",
			Detail:    detail,
		}
	}

	// Check for git operations in Bash tool output.
	if content := extractBashContent(raw); content != "" {
		if match := gitCmdRegex.FindStringSubmatch(content); len(match) > 1 {
			return &activityEvent{
				SessionID: sessionID,
				Timestamp: now,
				Type:      fmt.Sprintf("git:%s", match[1]),
				Icon:      "🔀",
				Category:  "git",
				Detail:    truncate(content, 200),
			}
		}
	}

	// Check for user messages.
	if isUserMessage(raw) {
		return &activityEvent{
			SessionID: sessionID,
			Timestamp: now,
			Type:      "message:user",
			Icon:      "💬",
			Category:  "message",
			Detail:    truncateStringField(raw, "content", 120),
		}
	}

	// Check for assistant responses.
	if isAssistantMessage(raw) {
		return &activityEvent{
			SessionID: sessionID,
			Timestamp: now,
			Type:      "message:assistant",
			Icon:      "🤖",
			Category:  "response",
			Detail:    truncateStringField(raw, "content", 120),
		}
	}

	return nil
}

// --- Helpers for JSON introspection ---

func isToolUse(raw map[string]interface{}) bool {
	if t, _ := raw["type"].(string); t == "tool_use" {
		return true
	}
	if _, ok := raw["tool_name"]; ok {
		return true
	}
	// Nested content blocks.
	if content, ok := raw["content"].([]interface{}); ok {
		for _, block := range content {
			if m, ok := block.(map[string]interface{}); ok {
				if t, _ := m["type"].(string); t == "tool_use" {
					return true
				}
			}
		}
	}
	return false
}

func extractToolName(raw map[string]interface{}) string {
	if name, ok := raw["tool_name"].(string); ok {
		return name
	}
	if name, ok := raw["name"].(string); ok {
		return name
	}
	// Nested in content blocks.
	if content, ok := raw["content"].([]interface{}); ok {
		for _, block := range content {
			if m, ok := block.(map[string]interface{}); ok {
				if name, ok := m["name"].(string); ok {
					return name
				}
				if name, ok := m["tool_name"].(string); ok {
					return name
				}
			}
		}
	}
	return "unknown"
}

func extractToolDetail(raw map[string]interface{}, toolName string) string {
	// Try to extract file_path or command from the tool input.
	input, ok := raw["input"].(map[string]interface{})
	if !ok {
		// Try nested.
		if content, ok := raw["content"].([]interface{}); ok {
			for _, block := range content {
				if m, ok := block.(map[string]interface{}); ok {
					if inp, ok := m["input"].(map[string]interface{}); ok {
						input = inp
						break
					}
				}
			}
		}
	}
	if input == nil {
		return toolName
	}

	switch toolName {
	case "Read", "Edit", "Write":
		if fp, ok := input["file_path"].(string); ok {
			return fp
		}
	case "Bash":
		if cmd, ok := input["command"].(string); ok {
			return truncate(cmd, 200)
		}
	case "Grep", "Glob":
		if pat, ok := input["pattern"].(string); ok {
			return pat
		}
	}
	return toolName
}

func extractBashContent(raw map[string]interface{}) string {
	// Check if this is a Bash tool_use with a command input.
	toolName := extractToolName(raw)
	if toolName != "Bash" {
		return ""
	}
	input, ok := raw["input"].(map[string]interface{})
	if !ok {
		return ""
	}
	cmd, _ := input["command"].(string)
	return cmd
}

func isUserMessage(raw map[string]interface{}) bool {
	if t, _ := raw["type"].(string); t == "human" {
		return true
	}
	if role, _ := raw["role"].(string); role == "user" {
		return true
	}
	return false
}

func isAssistantMessage(raw map[string]interface{}) bool {
	if t, _ := raw["type"].(string); t == "assistant" {
		return true
	}
	if role, _ := raw["role"].(string); role == "assistant" {
		return true
	}
	return false
}

func truncateStringField(raw map[string]interface{}, key string, max int) string {
	s, _ := raw[key].(string)
	return truncate(s, max)
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
