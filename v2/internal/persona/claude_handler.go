// Author: Subash Karki
package persona

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"
	"github.com/google/uuid"

	"github.com/subashkarki/phantom-os-v2/internal/composer"
)

// ClaudeHandler manages Claude sessions via the Composer Manager.
// It supports spawn, status, pause, stop, and resume operations.
type ClaudeHandler struct {
	mgr       *composer.Manager
	updateFn  func(PillState, string) // callback to update Persona pill state
	mu        sync.RWMutex
	sessions  map[string]*claudeSession // managed session ID → tracking state
}

// claudeSession tracks per-session state for the pill display.
type claudeSession struct {
	id        string
	task      string
	lastTool  string
	lastFile  string
	completed bool
	result    string
	startedAt time.Time
}

// NewClaudeHandler creates a handler that uses the given Composer Manager to
// spawn, observe, pause, stop, and resume Claude sessions.
func NewClaudeHandler(mgr *composer.Manager, updateFn func(PillState, string)) *ClaudeHandler {
	return &ClaudeHandler{
		mgr:      mgr,
		updateFn: updateFn,
		sessions: make(map[string]*claudeSession),
	}
}

func (h *ClaudeHandler) Handle(ctx context.Context, intent Intent, projectPath string) Response {
	switch intent.Method {
	case "spawn":
		return h.spawn(ctx, intent, projectPath)
	case "status":
		return h.status(ctx)
	case "pause":
		return h.pause(ctx, intent)
	case "stop":
		return h.stop(ctx, intent)
	case "resume":
		return h.resume(ctx, intent, projectPath)
	default:
		return Response{
			Text:  "Unknown Claude action: " + intent.Method,
			Speak: "Unknown Claude action.",
		}
	}
}

// spawn opens a new managed Claude session with the task description as prompt.
func (h *ClaudeHandler) spawn(ctx context.Context, intent Intent, projectPath string) Response {
	if h.mgr == nil {
		return Response{Text: "Composer manager not available.", Speak: "Composer not available."}
	}

	task := intent.Args["task"]
	if task == "" {
		task = intent.Raw
	}

	cwd := projectPath
	if cwd == "" {
		cwd = "."
	}

	sessionID := "persona-" + uuid.New().String()[:8]

	opts := composer.SessionOptions{
		Model:          "sonnet",
		PermissionMode: "auto",
		MaxTurns:       100,
		RunHandshake:   true,
	}

	// Track session state locally.
	cs := &claudeSession{
		id:        sessionID,
		task:      task,
		startedAt: time.Now(),
	}
	h.mu.Lock()
	h.sessions[sessionID] = cs
	h.mu.Unlock()

	// Build event handler that tracks tool use and completion.
	eventHandler := h.makeEventHandler(sessionID)

	info, err := h.mgr.Open(sessionID, cwd, opts, eventHandler)
	if err != nil {
		h.mu.Lock()
		delete(h.sessions, sessionID)
		h.mu.Unlock()
		text := fmt.Sprintf("Failed to start Claude session: %s", err)
		return Response{Text: text, Speak: "Failed to start Claude."}
	}

	// Send the task as the initial prompt.
	if sess, ok := h.mgr.Get(sessionID); ok {
		prompt := map[string]interface{}{
			"type":  "user",
			"text":  task,
		}
		data, _ := json.Marshal(prompt)
		if err := sess.Send(data); err != nil {
			log.Warn("persona/claude: failed to send initial prompt", "session", sessionID, "err", err)
		}
	}

	h.updateFn(PillObserving, fmt.Sprintf("Claude: %s", truncate(task, 40)))

	text := fmt.Sprintf("Started Claude session: %s (status: %s)", info.ID, info.Status)
	return Response{
		Text:  text,
		Speak: fmt.Sprintf("Started Claude session %s.", info.ID),
		QuickActions: []QuickAction{
			{Label: "Pause", Action: "persona:ask", Args: map[string]string{"input": "pause claude"}},
			{Label: "Stop", Action: "persona:ask", Args: map[string]string{"input": "stop claude"}},
			{Label: "Status", Action: "persona:ask", Args: map[string]string{"input": "claude status"}},
		},
	}
}

// makeEventHandler returns an EventHandler that tracks tool use, file edits,
// and completion for a given session.
func (h *ClaudeHandler) makeEventHandler(sessionID string) composer.EventHandler {
	return func(ev composer.StreamEvent) {
		h.mu.Lock()
		cs, ok := h.sessions[sessionID]
		if !ok {
			h.mu.Unlock()
			return
		}

		switch ev.Kind {
		case composer.EventToolUseStart, composer.EventStreamEvent:
			if ev.ToolName != "" {
				cs.lastTool = ev.ToolName
				// Extract file path from tool input if available.
				if len(ev.ToolInput) > 0 {
					var input map[string]interface{}
					if json.Unmarshal(ev.ToolInput, &input) == nil {
						if fp, ok := input["file_path"].(string); ok {
							cs.lastFile = filepath.Base(fp)
						} else if fp, ok := input["path"].(string); ok {
							cs.lastFile = filepath.Base(fp)
						}
					}
				}
				h.mu.Unlock()

				// Update pill state with current tool activity.
				label := formatToolLabel(cs.lastTool, cs.lastFile)
				h.updateFn(PillObserving, fmt.Sprintf("Claude: %s", label))
				return
			}

		case composer.EventResultSuccess:
			cs.completed = true
			cs.result = "success"
			summary := ev.Result
			if summary == "" {
				summary = "Task completed."
			}
			h.mu.Unlock()
			h.updateFn(PillAttention, fmt.Sprintf("Claude done: %s", truncate(summary, 50)))
			return

		case composer.EventResultError:
			cs.completed = true
			cs.result = "error"
			errText := ev.Text
			if errText == "" {
				errText = "Unknown error."
			}
			h.mu.Unlock()
			h.updateFn(PillAttention, fmt.Sprintf("Claude error: %s", truncate(errText, 50)))
			return
		}

		h.mu.Unlock()
	}
}

// status reports what active Claude sessions are doing.
func (h *ClaudeHandler) status(ctx context.Context) Response {
	if h.mgr == nil {
		return Response{Text: "Composer manager not available.", Speak: "Composer not available."}
	}

	sessions := h.mgr.List()
	if len(sessions) == 0 {
		return Response{Text: "No active Claude sessions.", Speak: "No active Claude sessions."}
	}

	var lines []string
	for _, info := range sessions {
		line := fmt.Sprintf("• %s — %s", info.ID, info.Status)

		// Append tracked tool/file info if available.
		h.mu.RLock()
		if cs, ok := h.sessions[info.ID]; ok {
			if cs.lastTool != "" {
				line += fmt.Sprintf(" (last tool: %s", cs.lastTool)
				if cs.lastFile != "" {
					line += fmt.Sprintf(", file: %s", cs.lastFile)
				}
				line += ")"
			}
		}
		h.mu.RUnlock()

		lines = append(lines, line)
	}

	text := fmt.Sprintf("%d session(s):\n%s", len(sessions), strings.Join(lines, "\n"))
	return Response{Text: text, Speak: fmt.Sprintf("%d Claude session(s) active.", len(sessions))}
}

// pause hibernates the most recent active session (or a specific one from args).
func (h *ClaudeHandler) pause(ctx context.Context, intent Intent) Response {
	if h.mgr == nil {
		return Response{Text: "Composer manager not available.", Speak: "Composer not available."}
	}

	sessionID := intent.Args["session"]
	if sessionID == "" {
		sessionID = h.findActiveSession()
	}
	if sessionID == "" {
		return Response{Text: "No active Claude session to pause.", Speak: "No session to pause."}
	}

	sess, ok := h.mgr.Get(sessionID)
	if !ok {
		return Response{Text: fmt.Sprintf("Session %s not found.", sessionID), Speak: "Session not found."}
	}

	if err := sess.Hibernate(); err != nil {
		text := fmt.Sprintf("Failed to pause session %s: %s", sessionID, err)
		return Response{Text: text, Speak: "Failed to pause."}
	}

	h.updateFn(PillIdle, "Claude paused")
	text := fmt.Sprintf("Paused Claude session: %s", sessionID)
	return Response{
		Text:  text,
		Speak: "Claude session paused.",
		QuickActions: []QuickAction{
			{Label: "Resume", Action: "persona:ask", Args: map[string]string{"input": "resume claude"}},
		},
	}
}

// stop kills the most recent active session (or a specific one from args).
func (h *ClaudeHandler) stop(ctx context.Context, intent Intent) Response {
	if h.mgr == nil {
		return Response{Text: "Composer manager not available.", Speak: "Composer not available."}
	}

	sessionID := intent.Args["session"]
	if sessionID == "" {
		sessionID = h.findActiveSession()
	}
	if sessionID == "" {
		return Response{Text: "No active Claude session to stop.", Speak: "No session to stop."}
	}

	h.mgr.Close(sessionID)

	h.mu.Lock()
	delete(h.sessions, sessionID)
	h.mu.Unlock()

	h.updateFn(PillIdle, "Phantom")
	text := fmt.Sprintf("Stopped Claude session: %s", sessionID)
	return Response{Text: text, Speak: "Claude session stopped."}
}

// resume re-opens a hibernated session using its saved Claude session UUID.
func (h *ClaudeHandler) resume(ctx context.Context, intent Intent, projectPath string) Response {
	if h.mgr == nil {
		return Response{Text: "Composer manager not available.", Speak: "Composer not available."}
	}

	// Find a hibernated session to resume.
	sessionID := intent.Args["session"]
	if sessionID == "" {
		sessionID = h.findHibernatedSession()
	}
	if sessionID == "" {
		return Response{Text: "No hibernated Claude session to resume.", Speak: "No session to resume."}
	}

	sess, ok := h.mgr.Get(sessionID)
	if !ok {
		return Response{Text: fmt.Sprintf("Session %s not found.", sessionID), Speak: "Session not found."}
	}

	claudeUUID := sess.HibernateUUID()
	if claudeUUID == "" {
		return Response{
			Text:  fmt.Sprintf("Session %s has no saved Claude UUID to resume.", sessionID),
			Speak: "Cannot resume — no saved session.",
		}
	}

	// Close the old hibernated entry and open fresh with --resume.
	h.mgr.Close(sessionID)

	cwd := projectPath
	if cwd == "" {
		cwd = "."
	}

	newID := "persona-" + uuid.New().String()[:8]
	opts := composer.SessionOptions{
		ClaudeSessionID: claudeUUID,
		Model:           "sonnet",
		PermissionMode:  "auto",
		MaxTurns:        100,
		RunHandshake:    true,
	}

	// Copy tracked state to new session.
	h.mu.Lock()
	oldCS := h.sessions[sessionID]
	newCS := &claudeSession{
		id:        newID,
		startedAt: time.Now(),
	}
	if oldCS != nil {
		newCS.task = oldCS.task
	}
	delete(h.sessions, sessionID)
	h.sessions[newID] = newCS
	h.mu.Unlock()

	eventHandler := h.makeEventHandler(newID)
	info, err := h.mgr.Open(newID, cwd, opts, eventHandler)
	if err != nil {
		h.mu.Lock()
		delete(h.sessions, newID)
		h.mu.Unlock()
		text := fmt.Sprintf("Failed to resume Claude session: %s", err)
		return Response{Text: text, Speak: "Failed to resume."}
	}

	h.updateFn(PillObserving, "Claude: resuming...")

	text := fmt.Sprintf("Resumed Claude session: %s (was %s, status: %s)", info.ID, sessionID, info.Status)
	return Response{
		Text:  text,
		Speak: "Claude session resumed.",
		QuickActions: []QuickAction{
			{Label: "Pause", Action: "persona:ask", Args: map[string]string{"input": "pause claude"}},
			{Label: "Stop", Action: "persona:ask", Args: map[string]string{"input": "stop claude"}},
			{Label: "Status", Action: "persona:ask", Args: map[string]string{"input": "claude status"}},
		},
	}
}

// findActiveSession returns the ID of the first running persona-managed session.
func (h *ClaudeHandler) findActiveSession() string {
	sessions := h.mgr.List()
	for _, info := range sessions {
		if info.Status == composer.StatusRunning && strings.HasPrefix(info.ID, "persona-") {
			return info.ID
		}
	}
	// Fallback: any running session.
	for _, info := range sessions {
		if info.Status == composer.StatusRunning {
			return info.ID
		}
	}
	return ""
}

// findHibernatedSession returns the ID of the first hibernated persona-managed session.
func (h *ClaudeHandler) findHibernatedSession() string {
	sessions := h.mgr.List()
	for _, info := range sessions {
		if info.Status == composer.StatusPaused && strings.HasPrefix(info.ID, "persona-") {
			return info.ID
		}
	}
	// Check via Manager.IsHibernated for sessions that report paused status.
	for _, info := range sessions {
		if h.mgr.IsHibernated(info.ID) {
			return info.ID
		}
	}
	return ""
}

// ─── helpers ──────────────────────────────────────────────────────────────

// formatToolLabel builds a short label like "editing auth.ts" or "Read file".
func formatToolLabel(tool, file string) string {
	shortTool := tool
	// Strip common prefixes from tool names.
	for _, prefix := range []string{"mcp__", "computer_", "bash_"} {
		shortTool = strings.TrimPrefix(shortTool, prefix)
	}

	switch {
	case file != "" && strings.Contains(strings.ToLower(shortTool), "edit"):
		return fmt.Sprintf("editing %s", file)
	case file != "" && strings.Contains(strings.ToLower(shortTool), "write"):
		return fmt.Sprintf("writing %s", file)
	case file != "" && strings.Contains(strings.ToLower(shortTool), "read"):
		return fmt.Sprintf("reading %s", file)
	case file != "":
		return fmt.Sprintf("%s → %s", shortTool, file)
	default:
		return shortTool
	}
}

// truncate returns s truncated to maxLen with "..." suffix if needed.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	if maxLen <= 3 {
		return s[:maxLen]
	}
	return s[:maxLen-3] + "..."
}
