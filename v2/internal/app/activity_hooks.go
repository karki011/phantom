// activity_hooks.go — AI-agnostic activity event detection from the JSONL stream.
// Detects plan mode transitions, todo writes, and task operations from any
// provider's conversation stream. All heavy work is dispatched async to avoid
// blocking the stream consumer pipeline.
//
// Author: Subash Karki
package app

import (
	"strings"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// activityToolSet maps tool names to Wails event names.
// Provider-agnostic — any AI tool that emits these tool names
// (Claude, Codex, Gemini, etc.) will trigger the corresponding events.
var activityToolSet = map[string]string{
	"EnterPlanMode": "plan:started",
	"ExitPlanMode":  "plan:completed",
	"TodoWrite":     "todo:written",
	"TodoRead":      "todo:read",
	"TaskCreate":    "task:stream_created",
	"TaskUpdate":    "task:stream_updated",
}

// detectActivityEvents inspects a stream event for activity-relevant tool calls
// and emits corresponding Wails events. Called from the stream EventHook in app.go.
//
// Performance: the first type check short-circuits >95% of events in nanoseconds.
// Matching events dispatch Wails emission in a goroutine to avoid blocking.
func (a *App) detectActivityEvents(ev *stream.Event) {
	if ev.Type != stream.EventToolUse {
		return
	}

	eventName, ok := activityToolSet[ev.ToolName]
	if !ok {
		return
	}

	payload := map[string]string{
		"sessionId": ev.SessionID,
		"toolName":  ev.ToolName,
	}

	go wailsRuntime.EventsEmit(a.ctx, eventName, payload)

	// Plan file detection — runs after the map lookup so both can fire for the
	// same event if a Write tool name ever appears in activityToolSet.

	if ev.ToolName == "Write" && isPlanFile(ev.FilePath) {
		title, total, done := parsePlanContent(ev.NewContent)
		go wailsRuntime.EventsEmit(a.ctx, "plan:file_created", map[string]interface{}{
			"sessionId":  ev.SessionID,
			"filePath":   ev.FilePath,
			"title":      title,
			"totalTasks": total,
			"doneTasks":  done,
		})
	}

	if ev.ToolName == "Skill" {
		// Parse ToolInput JSON to check skill name.
		if strings.Contains(ev.ToolInput, "writing-plans") || strings.Contains(ev.ToolInput, "write-plan") {
			go wailsRuntime.EventsEmit(a.ctx, "plan:generating", map[string]string{
				"sessionId": ev.SessionID,
			})
		}
	}
}

// isPlanFile checks if a file path looks like a plan document.
func isPlanFile(path string) bool {
	if !strings.HasSuffix(strings.ToLower(path), ".md") {
		return false
	}
	lower := strings.ToLower(path)
	return strings.Contains(lower, "/plans/") ||
		strings.Contains(lower, "/plan/") ||
		strings.Contains(lower, "plan-") ||
		strings.Contains(lower, "plan.md")
}

// parsePlanContent extracts title and task counts from plan markdown.
func parsePlanContent(content string) (title string, total int, done int) {
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if title == "" && strings.HasPrefix(trimmed, "# ") {
			title = strings.TrimPrefix(trimmed, "# ")
		}
		if strings.Contains(trimmed, "- [ ]") || strings.Contains(trimmed, "- []") {
			total++
		}
		if strings.Contains(trimmed, "- [x]") || strings.Contains(trimmed, "- [X]") {
			total++
			done++
		}
	}
	if title == "" {
		title = "Untitled Plan"
	}
	return
}
