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

	"github.com/fsnotify/fsnotify"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

const (
	activityPollInterval     = 5 * time.Second
	activityDebounce         = 500 * time.Millisecond
	activityFallbackInterval = 30 * time.Second
	activityRewatchInterval  = 60 * time.Second
)

// ActivityPoller watches active sessions' JSONL files for changes via fsnotify,
// extracts tool calls / git operations / messages, and inserts activity events.
// Falls back to 5s polling if fsnotify is unavailable.
type ActivityPoller struct {
	queries   *db.Queries
	prov      provider.Provider
	ctx       context.Context
	cancel    context.CancelFunc
	emitEvent func(name string, data interface{})
	journal   journalAppender // optional — appends notable events to journal work log

	mu          sync.Mutex
	fileOffsets map[string]int64 // byte offset per JSONL file path

	debounceMu     sync.Mutex
	debounceTimers map[string]*time.Timer
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
func NewActivityPoller(queries *db.Queries, prov provider.Provider, emitEvent func(string, interface{})) *ActivityPoller {
	return &ActivityPoller{
		queries:     queries,
		prov:        prov,
		emitEvent:   emitEvent,
		fileOffsets: make(map[string]int64),
	}
}

func (p *ActivityPoller) Name() string { return "activity-poller" }

// SetJournal injects the journal appender so the poller can log notable
// events (git commits, pushes, agent spawns) to the daily work log.
func (p *ActivityPoller) SetJournal(j journalAppender) {
	p.journal = j
}

func (p *ActivityPoller) Start(ctx context.Context) error {
	p.ctx, p.cancel = context.WithCancel(ctx)

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		slog.Warn("activity-poller: fsnotify unavailable, polling", "err", err)
		return p.pollLoop()
	}
	defer watcher.Close()

	p.debounceTimers = make(map[string]*time.Timer)
	p.watchProjectDirs(watcher)

	fallback := time.NewTicker(activityFallbackInterval)
	defer fallback.Stop()

	rewatch := time.NewTicker(activityRewatchInterval)
	defer rewatch.Stop()

	slog.Info("activity-poller started (fsnotify)")

	for {
		select {
		case <-p.ctx.Done():
			p.stopDebounceTimers()
			slog.Info("activity-poller stopped")
			return nil

		case ev, ok := <-watcher.Events:
			if !ok {
				return nil
			}
			if !strings.HasSuffix(ev.Name, ".jsonl") {
				continue
			}
			if !ev.Has(fsnotify.Write) && !ev.Has(fsnotify.Create) {
				continue
			}
			p.debouncedProcessFile(ev.Name)

		case err, ok := <-watcher.Errors:
			if !ok {
				return nil
			}
			slog.Error("activity-poller: watcher error", "err", err)

		case <-fallback.C:
			p.poll()

		case <-rewatch.C:
			p.watchProjectDirs(watcher)
		}
	}
}

// pollLoop is the legacy polling fallback when fsnotify is unavailable.
func (p *ActivityPoller) pollLoop() error {
	ticker := time.NewTicker(activityPollInterval)
	defer ticker.Stop()

	slog.Info("activity-poller started (polling)")

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

// watchProjectDirs adds fsnotify watches on conversations directory subdirectories.
func (p *ActivityPoller) watchProjectDirs(watcher *fsnotify.Watcher) {
	root := p.prov.ConversationsDir()
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() {
			_ = watcher.Add(filepath.Join(root, e.Name()))
		}
	}
}

// debouncedProcessFile schedules processing for a JSONL file change after 500ms.
func (p *ActivityPoller) debouncedProcessFile(jsonlPath string) {
	p.debounceMu.Lock()
	defer p.debounceMu.Unlock()

	if t, ok := p.debounceTimers[jsonlPath]; ok {
		t.Stop()
	}
	p.debounceTimers[jsonlPath] = time.AfterFunc(activityDebounce, func() {
		p.processFileChange(jsonlPath)
		p.debounceMu.Lock()
		delete(p.debounceTimers, jsonlPath)
		p.debounceMu.Unlock()
	})
}

// processFileChange reads new lines from a single JSONL file and emits activity events.
func (p *ActivityPoller) processFileChange(jsonlPath string) {
	sessionID := sessionIDFromPath(jsonlPath)
	if sessionID == "" {
		return
	}
	events := p.readNewLines(jsonlPath, sessionID)
	if len(events) == 0 {
		return
	}
	p.persistAndEmit(events)
}

// stopDebounceTimers cancels all pending debounce timers during shutdown.
func (p *ActivityPoller) stopDebounceTimers() {
	p.debounceMu.Lock()
	defer p.debounceMu.Unlock()
	for k, t := range p.debounceTimers {
		t.Stop()
		delete(p.debounceTimers, k)
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

	p.persistAndEmit(allEvents)
}

// persistAndEmit stores activity events in the DB and emits a Wails event.
func (p *ActivityPoller) persistAndEmit(events []activityEvent) {
	if len(events) == 0 {
		return
	}
	if len(events) > 100 {
		events = events[len(events)-100:]
	}

	now := time.Now().UnixMilli()
	for _, ev := range events {
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
			Provider:  p.prov.Name(),
		})
	}

	if p.emitEvent != nil {
		p.emitEvent(EventActivity, events)
	}

	// Append notable events to the daily journal work log.
	// Only log git commits, pushes, and agent spawns — skip noisy events
	// like tool:read, tool:edit, message:assistant, etc.
	if p.journal != nil {
		today := time.Now().Format("2006-01-02")
		ts := time.Now().Format("15:04")
		for _, ev := range events {
			var line string
			switch ev.Type {
			case "git:commit":
				detail := ev.Detail
				if len(detail) > 120 {
					detail = detail[:120] + "..."
				}
				line = fmt.Sprintf("%s Committed: %s", ts, detail)
			case "git:push":
				line = fmt.Sprintf("%s Pushed to remote", ts)
			case "tool:agent":
				if ev.Detail != "" && ev.Detail != "Agent" {
					detail := ev.Detail
					if len(detail) > 100 {
						detail = detail[:100] + "..."
					}
					line = fmt.Sprintf("%s Spawned agent: %s", ts, detail)
				}
			}
			if line != "" {
				// Prefix with project name from session if available
				sess, err := p.queries.GetSession(p.ctx, ev.SessionID)
				if err == nil && sess.Repo.Valid && sess.Repo.String != "" {
					line = fmt.Sprintf("%s [%s] %s", ts, sess.Repo.String, line[6:]) // replace ts prefix
				}
				p.journal.AppendWorkLog(today, line)
			}
		}
	}
}

// findJSONLPath returns the conversation file path for a session using the
// provider's FindConversationFile method.
func (p *ActivityPoller) findJSONLPath(sess db.Session) string {
	cwd := sess.Cwd.String
	if cwd == "" {
		return ""
	}

	path, err := p.prov.FindConversationFile(sess.ID, cwd)
	if err != nil {
		slog.Debug("activity-poller: find conversation file", "session_id", sess.ID, "cwd", cwd, "err", err)
		return ""
	}
	return path
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

	// Claude Code JSONL nests the actual payload under .message — unwrap so
	// helpers below can read content/role/input without a root-level wrapper.
	body := raw
	if msg, ok := raw["message"].(map[string]interface{}); ok {
		body = msg
	}

	// Use the outer envelope's type as the routing hint when present.
	outerType, _ := raw["type"].(string)

	now := time.Now().UnixMilli()

	// Check for tool use (assistant messages with tool_use content blocks).
	if isToolUse(body) {
		toolName := extractToolName(body)
		detail := extractToolDetail(body, toolName)
		icon, ok := knownTools[toolName]
		if !ok {
			icon = "🔧" // MCP or unknown tool
		}
		ev := &activityEvent{
			SessionID: sessionID,
			Timestamp: now,
			Type:      fmt.Sprintf("tool:%s", strings.ToLower(toolName)),
			Icon:      icon,
			Category:  "tool",
			Detail:    detail,
		}

		// If the tool is Bash and the command is a git op, emit a git event instead.
		if toolName == "Bash" {
			if cmd := extractBashContent(body); cmd != "" {
				if match := gitCmdRegex.FindStringSubmatch(cmd); len(match) > 1 {
					ev.Type = fmt.Sprintf("git:%s", match[1])
					ev.Icon = "🔀"
					ev.Category = "git"
					ev.Detail = truncate(cmd, 200)
				}
			}
		}
		return ev
	}

	// Check for user messages.
	if outerType == "user" || isUserMessage(body) {
		return &activityEvent{
			SessionID: sessionID,
			Timestamp: now,
			Type:      "message:user",
			Icon:      "💬",
			Category:  "message",
			Detail:    truncateStringField(body, "content", 120),
		}
	}

	// Check for assistant responses.
	if outerType == "assistant" || isAssistantMessage(body) {
		return &activityEvent{
			SessionID: sessionID,
			Timestamp: now,
			Type:      "message:assistant",
			Icon:      "🤖",
			Category:  "response",
			Detail:    truncateStringField(body, "content", 120),
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
