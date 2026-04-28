// hooks_config.go — Register/unregister PhantomOS v2 hooks in ~/.claude/settings.json.
// Manages hook entries without clobbering non-phantom hooks.
// Author: Subash Karki
package integration

import (
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// phantomHookPrefix identifies phantom hooks by their command path.
const phantomHookPrefix = "phantom-os/v2/hooks/"

// hookDef describes a single hook command entry.
type hookDef struct {
	Type    string `json:"type"`
	Command string `json:"command"`
	Timeout int    `json:"timeout,omitempty"`
}

// hookEntry describes a matcher + hooks array in Claude settings.
type hookEntry struct {
	Matcher string    `json:"matcher"`
	Hooks   []hookDef `json:"hooks"`
}

// buildPhantomHooks returns the hook entries keyed by event type,
// based on which AI features are enabled.
func buildPhantomHooks(hooksDir string, features map[string]bool) map[string][]hookEntry {
	entries := make(map[string][]hookEntry)

	// UserPromptSubmit — prompt-enricher (auto-context)
	if features["ai.autoContext"] {
		entries["UserPromptSubmit"] = append(entries["UserPromptSubmit"], hookEntry{
			Matcher: "",
			Hooks: []hookDef{{
				Type:    "command",
				Command: "node " + filepath.Join(hooksDir, "prompt-enricher.js"),
				Timeout: 5,
			}},
		})
	}

	// PreToolUse — edit-gate (edit safety)
	if features["ai.editGate"] {
		entries["PreToolUse"] = append(entries["PreToolUse"], hookEntry{
			Matcher: "Edit|Write|MultiEdit",
			Hooks: []hookDef{{
				Type:    "command",
				Command: "node " + filepath.Join(hooksDir, "edit-gate.js"),
				Timeout: 5,
			}},
		})
	}

	// Stop — outcome-capture + async-analyzer (outcome learning)
	if features["ai.outcomeCapture"] {
		entries["Stop"] = append(entries["Stop"], hookEntry{
			Matcher: "",
			Hooks: []hookDef{
				{
					Type:    "command",
					Command: "node " + filepath.Join(hooksDir, "outcome-capture.js"),
					Timeout: 5,
				},
				{
					Type:    "command",
					Command: "node " + filepath.Join(hooksDir, "async-analyzer.js"),
					Timeout: 10,
				},
			},
		})
	}

	// FileChanged — file-changed (file sync)
	if features["ai.fileSync"] {
		entries["FileChanged"] = append(entries["FileChanged"], hookEntry{
			Matcher: "",
			Hooks: []hookDef{{
				Type:    "command",
				Command: "node " + filepath.Join(hooksDir, "file-changed.js"),
				Timeout: 5,
			}},
		})
	}

	// PostToolUse — feedback-detector (always when any hooks are registered)
	if features["ai.autoContext"] || features["ai.editGate"] || features["ai.outcomeCapture"] || features["ai.fileSync"] {
		entries["PostToolUse"] = append(entries["PostToolUse"], hookEntry{
			Matcher: "Bash|Edit|Write|MultiEdit",
			Hooks: []hookDef{{
				Type:    "command",
				Command: "node " + filepath.Join(hooksDir, "feedback-detector.js"),
				Timeout: 5,
			}},
		})
	}

	return entries
}

// isPhantomHook checks if a hook command belongs to PhantomOS.
func isPhantomHook(command string) bool {
	return strings.Contains(command, phantomHookPrefix)
}

// RegisterPhantomHooks writes hook entries to ~/.claude/settings.json.
// Preserves all non-phantom hooks while replacing phantom-specific ones.
func RegisterPhantomHooks(hooksDir string, features map[string]bool) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	settingsPath := filepath.Join(home, ".claude", "settings.json")
	settings := readJSONFile(settingsPath)

	hooks, _ := settings["hooks"].(map[string]any)
	if hooks == nil {
		hooks = make(map[string]any)
	}

	// Build the desired phantom hooks.
	phantomHooks := buildPhantomHooks(hooksDir, features)

	// For each hook event type, remove existing phantom entries and add new ones.
	// Process all known event types to ensure cleanup of disabled features.
	allEventTypes := []string{
		"UserPromptSubmit", "PreToolUse", "PostToolUse",
		"Stop", "FileChanged",
	}

	for _, eventType := range allEventTypes {
		existing, _ := hooks[eventType].([]any)

		// Keep non-phantom hooks.
		var kept []any
		for _, entry := range existing {
			entryMap, ok := entry.(map[string]any)
			if !ok {
				kept = append(kept, entry)
				continue
			}
			hooksList, _ := entryMap["hooks"].([]any)
			hasPhantom := false
			for _, h := range hooksList {
				hMap, _ := h.(map[string]any)
				if cmd, _ := hMap["command"].(string); isPhantomHook(cmd) {
					hasPhantom = true
					break
				}
			}
			if !hasPhantom {
				kept = append(kept, entry)
			}
		}

		// Add new phantom hooks for this event type.
		if newEntries, ok := phantomHooks[eventType]; ok {
			for _, entry := range newEntries {
				hookDefs := make([]any, 0, len(entry.Hooks))
				for _, h := range entry.Hooks {
					hMap := map[string]any{
						"type":    h.Type,
						"command": h.Command,
					}
					if h.Timeout > 0 {
						hMap["timeout"] = h.Timeout
					}
					hookDefs = append(hookDefs, hMap)
				}
				kept = append(kept, map[string]any{
					"matcher": entry.Matcher,
					"hooks":   hookDefs,
				})
			}
		}

		if len(kept) > 0 {
			hooks[eventType] = kept
		} else {
			delete(hooks, eventType)
		}
	}

	settings["hooks"] = hooks
	if err := writeJSONFile(settingsPath, settings); err != nil {
		return err
	}
	slog.Info("🧠 Hooks registered", "dir", hooksDir)
	return nil
}

// UnregisterPhantomHooks removes all phantom hook entries from
// ~/.claude/settings.json, leaving non-phantom hooks intact.
func UnregisterPhantomHooks() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	settingsPath := filepath.Join(home, ".claude", "settings.json")
	settings := readJSONFile(settingsPath)

	hooks, _ := settings["hooks"].(map[string]any)
	if hooks == nil {
		return nil
	}

	for eventType, entries := range hooks {
		entryList, ok := entries.([]any)
		if !ok {
			continue
		}

		var kept []any
		for _, entry := range entryList {
			entryMap, ok := entry.(map[string]any)
			if !ok {
				kept = append(kept, entry)
				continue
			}
			hooksList, _ := entryMap["hooks"].([]any)
			hasPhantom := false
			for _, h := range hooksList {
				hMap, _ := h.(map[string]any)
				if cmd, _ := hMap["command"].(string); isPhantomHook(cmd) {
					hasPhantom = true
					break
				}
			}
			if !hasPhantom {
				kept = append(kept, entry)
			}
		}

		if len(kept) > 0 {
			hooks[eventType] = kept
		} else {
			delete(hooks, eventType)
		}
	}

	settings["hooks"] = hooks
	if err := writeJSONFile(settingsPath, settings); err != nil {
		return err
	}
	slog.Info("🧠 Hooks unregistered")
	return nil
}
