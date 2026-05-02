// Author: Subash Karki
// bindings_terminal_activity.go bridges the JSONL tailing pipeline to terminal panes.
// When a terminal pane is linked to a Claude session, stream events from that
// session are emitted as terminal:activity events with the pane ID attached so
// the frontend can render live activity per terminal.
package app

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"path/filepath"
	"sync"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// terminalSessionMap is a concurrent map of sessionID → set of paneIDs.
// Updated on terminal:linked / terminal:unlinked events.
type terminalSessionMap struct {
	mu sync.RWMutex
	// sessionToPanes maps a Claude session ID to the set of terminal pane IDs
	// that are linked to it. Multiple terminals can view the same session.
	sessionToPanes map[string]map[string]struct{}
	// paneToSession is the reverse lookup: pane ID → session ID.
	paneToSession map[string]string
}

func newTerminalSessionMap() *terminalSessionMap {
	return &terminalSessionMap{
		sessionToPanes: make(map[string]map[string]struct{}),
		paneToSession:  make(map[string]string),
	}
}

// link registers a pane as linked to a session.
func (m *terminalSessionMap) link(paneID, sessionID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Remove any prior link for this pane.
	if oldSession, ok := m.paneToSession[paneID]; ok && oldSession != sessionID {
		if panes, exists := m.sessionToPanes[oldSession]; exists {
			delete(panes, paneID)
			if len(panes) == 0 {
				delete(m.sessionToPanes, oldSession)
			}
		}
	}

	m.paneToSession[paneID] = sessionID
	panes, ok := m.sessionToPanes[sessionID]
	if !ok {
		panes = make(map[string]struct{})
		m.sessionToPanes[sessionID] = panes
	}
	panes[paneID] = struct{}{}
}

// unlink removes a pane's link.
func (m *terminalSessionMap) unlink(paneID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	sessionID, ok := m.paneToSession[paneID]
	if !ok {
		return
	}
	delete(m.paneToSession, paneID)

	if panes, exists := m.sessionToPanes[sessionID]; exists {
		delete(panes, paneID)
		if len(panes) == 0 {
			delete(m.sessionToPanes, sessionID)
		}
	}
}

// unlinkSession removes all pane links for a given session.
func (m *terminalSessionMap) unlinkSession(sessionID string) []string {
	m.mu.Lock()
	defer m.mu.Unlock()

	panes, ok := m.sessionToPanes[sessionID]
	if !ok {
		return nil
	}
	removed := make([]string, 0, len(panes))
	for paneID := range panes {
		delete(m.paneToSession, paneID)
		removed = append(removed, paneID)
	}
	delete(m.sessionToPanes, sessionID)
	return removed
}

// panesForSession returns all pane IDs linked to a session.
func (m *terminalSessionMap) panesForSession(sessionID string) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	panes, ok := m.sessionToPanes[sessionID]
	if !ok {
		return nil
	}
	result := make([]string, 0, len(panes))
	for p := range panes {
		result = append(result, p)
	}
	return result
}

// sessionForPane returns the session linked to a pane, or "" if unlinked.
func (m *terminalSessionMap) sessionForPane(paneID string) string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.paneToSession[paneID]
}

// --- App integration ---

// initTerminalActivityBridge sets up the in-memory session↔pane map and
// hydrates it from the database. Called once during Startup.
func (a *App) initTerminalActivityBridge() {
	a.tsMap = newTerminalSessionMap()

	// Hydrate from DB: any terminals that are already linked to sessions.
	if a.DB == nil {
		return
	}
	q := db.New(a.DB.Reader)
	terminals, err := q.ListActiveTerminals(a.ctx)
	if err != nil {
		slog.Warn("terminal-activity: hydrate from DB failed", "err", err)
		return
	}
	for _, t := range terminals {
		if t.SessionID.Valid && t.SessionID.String != "" {
			a.tsMap.link(t.PaneID, t.SessionID.String)
			slog.Debug("terminal-activity: hydrated link", "pane_id", t.PaneID, "session_id", t.SessionID.String)
		}
	}
}

// onTerminalLinked is called when the Linker links a terminal to a session.
// It updates the in-memory map and emits the terminal:session-linked event.
func (a *App) onTerminalLinked(paneID, sessionID string) {
	if a.tsMap == nil {
		return
	}
	a.tsMap.link(paneID, sessionID)
	slog.Info("terminal-activity: linked", "pane_id", paneID, "session_id", sessionID)

	// Resolve session name for the frontend.
	sessionName := ""
	if a.DB != nil {
		q := db.New(a.DB.Reader)
		if s, err := q.GetSession(a.ctx, sessionID); err == nil && s.Name.Valid {
			sessionName = s.Name.String
		}
	}

	wailsRuntime.EventsEmit(a.ctx, EventTerminalSessionLinked, map[string]interface{}{
		"paneId":      paneID,
		"sessionId":   sessionID,
		"sessionName": sessionName,
	})

	// Ensure tailing is started for this session.
	if a.Stream != nil {
		if err := a.StartStreamSession(sessionID); err != nil {
			slog.Warn("terminal-activity: start tailing for linked session", "session_id", sessionID, "err", err)
		}
	}
}

// onTerminalUnlinked is called when a terminal's session link is removed.
func (a *App) onTerminalUnlinked(paneID, sessionID string) {
	if a.tsMap == nil {
		return
	}
	a.tsMap.unlink(paneID)
	slog.Info("terminal-activity: unlinked", "pane_id", paneID, "session_id", sessionID)

	wailsRuntime.EventsEmit(a.ctx, EventTerminalSessionUnlinked, map[string]interface{}{
		"paneId":    paneID,
		"sessionId": sessionID,
	})
}

// emitTerminalActivity is called from the stream event hook for every tailed
// event. If the event's session is linked to any terminal panes, it emits a
// terminal:activity event for each pane.
func (a *App) emitTerminalActivity(ev *stream.Event) {
	if a.tsMap == nil || ev == nil {
		return
	}

	panes := a.tsMap.panesForSession(ev.SessionID)
	if len(panes) == 0 {
		return
	}

	summary := formatActivitySummary(ev)
	slog.Info("terminal-activity: event", "session_id", ev.SessionID, "tool", ev.ToolName, "summary", summary, "panes", len(panes))

	for _, paneID := range panes {
		go wailsRuntime.EventsEmit(a.ctx, EventTerminalActivity, map[string]interface{}{
			"pane_id":    paneID,
			"session_id": ev.SessionID,
			"summary":    summary,
			"event_type": string(ev.Type),
			"tool_name":  ev.ToolName,
			"file_path":  ev.FilePath,
			"is_error":   ev.IsError,
			"timestamp":  ev.Timestamp,
		})
	}
}

// GetTerminalSessionActivity returns recent structured events for a terminal's
// linked Claude session. The frontend calls this to populate initial state
// when a terminal pane gains focus or is first linked.
func (a *App) GetTerminalSessionActivity(paneID string) []stream.Event {
	if a.tsMap == nil {
		return nil
	}

	sessionID := a.tsMap.sessionForPane(paneID)
	if sessionID == "" {
		return nil
	}

	if a.Stream == nil {
		return nil
	}

	events, err := a.Stream.GetEvents(a.ctx, sessionID, 0, 50)
	if err != nil {
		slog.Warn("GetTerminalSessionActivity: query failed", "pane_id", paneID, "session_id", sessionID, "err", err)
		return nil
	}
	return events
}

// GetTerminalLinkedSession returns the session ID and name linked to a
// terminal pane, or empty strings if unlinked. Used by the frontend to
// check if a terminal has an active Claude session.
func (a *App) GetTerminalLinkedSession(paneID string) map[string]string {
	result := map[string]string{
		"sessionId":   "",
		"sessionName": "",
	}

	if a.tsMap == nil {
		return result
	}

	sessionID := a.tsMap.sessionForPane(paneID)
	if sessionID == "" {
		return result
	}
	result["sessionId"] = sessionID

	if a.DB != nil {
		q := db.New(a.DB.Reader)
		if s, err := q.GetSession(a.ctx, sessionID); err == nil && s.Name.Valid {
			result["sessionName"] = s.Name.String
		}
	}

	return result
}

// --- Activity summary formatting ---

// formatActivitySummary produces a human-readable summary string from a stream
// event. The frontend renders this directly — no further parsing needed.
func formatActivitySummary(ev *stream.Event) string {
	if ev == nil {
		return ""
	}

	switch ev.Type {
	case stream.EventToolUse:
		return formatToolUseSummary(ev)
	case stream.EventToolResult:
		if ev.IsError {
			return "Tool error"
		}
		return ""
	case stream.EventAssistant:
		content := ev.Content
		if len(content) > 80 {
			content = content[:77] + "..."
		}
		if content != "" {
			return fmt.Sprintf("Thinking: %s", content)
		}
		return "Responding"
	case stream.EventThinking:
		return "Thinking..."
	case stream.EventUser:
		return "User message"
	case stream.EventError:
		return "Error occurred"
	default:
		return ""
	}
}

// formatToolUseSummary generates a summary for a tool_use event.
func formatToolUseSummary(ev *stream.Event) string {
	switch ev.ToolName {
	case "Edit", "MultiEdit":
		if ev.FilePath != "" {
			return fmt.Sprintf("Editing %s", filepath.Base(ev.FilePath))
		}
		return "Editing file"
	case "Write":
		if ev.FilePath != "" {
			return fmt.Sprintf("Writing %s", filepath.Base(ev.FilePath))
		}
		return "Writing file"
	case "Read":
		if ev.FilePath != "" {
			return fmt.Sprintf("Reading %s", filepath.Base(ev.FilePath))
		}
		return "Reading file"
	case "Bash":
		cmd := extractCommandPreview(ev.ToolInput, 60)
		if cmd != "" {
			return fmt.Sprintf("Running: %s", cmd)
		}
		return "Running command"
	case "Grep":
		pat := extractJSONField(ev.ToolInput, "pattern")
		if pat != "" {
			return fmt.Sprintf("Searching: %s", truncateStr(pat, 60))
		}
		return "Searching"
	case "Glob":
		pat := extractJSONField(ev.ToolInput, "pattern")
		if pat != "" {
			return fmt.Sprintf("Finding files: %s", truncateStr(pat, 60))
		}
		return "Finding files"
	case "Agent", "Task":
		return "Spawning agent"
	case "Skill":
		skill := extractJSONField(ev.ToolInput, "skill")
		if skill != "" {
			return fmt.Sprintf("Using skill: %s", skill)
		}
		return "Using skill"
	case "WebFetch":
		url := extractJSONField(ev.ToolInput, "url")
		if url != "" {
			return fmt.Sprintf("Fetching: %s", truncateStr(url, 50))
		}
		return "Fetching URL"
	default:
		if ev.ToolName != "" {
			return fmt.Sprintf("Using %s", ev.ToolName)
		}
		return ""
	}
}

// extractCommandPreview extracts the "command" field from a tool input JSON
// string and returns the first maxLen characters.
func extractCommandPreview(toolInput string, maxLen int) string {
	cmd := extractJSONField(toolInput, "command")
	return truncateStr(cmd, maxLen)
}

// extractJSONField extracts a string field from a raw JSON string.
// Returns "" if the field doesn't exist or isn't a string.
func extractJSONField(rawJSON, field string) string {
	if rawJSON == "" {
		return ""
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(rawJSON), &m); err != nil {
		return ""
	}
	v, ok := m[field].(string)
	if !ok {
		return ""
	}
	return v
}

// truncateStr shortens a string to maxLen characters, appending "..." if truncated.
func truncateStr(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	if maxLen <= 3 {
		return s[:maxLen]
	}
	return s[:maxLen-3] + "..."
}
