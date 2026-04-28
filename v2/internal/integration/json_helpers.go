// json_helpers.go — Safe JSON file read/write helpers for config manipulation.
// Handles missing files, parse errors, and atomic writes gracefully.
// Author: Subash Karki
package integration

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
)

// readJSONFile reads a JSON file into a map. Returns an empty map on any error.
func readJSONFile(path string) map[string]any {
	data, err := os.ReadFile(path)
	if err != nil {
		return make(map[string]any)
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		slog.Warn("🧠 Failed to parse JSON file", "path", path, "err", err)
		return make(map[string]any)
	}
	return result
}

// writeJSONFile writes a map to a JSON file atomically (write tmp + rename).
// Creates parent directories if they don't exist.
func writeJSONFile(path string, data map[string]any) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		slog.Error("🧠 Failed to create directory", "dir", dir, "err", err)
		return err
	}

	content, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		slog.Error("🧠 Failed to marshal JSON", "path", path, "err", err)
		return err
	}
	content = append(content, '\n')

	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, content, 0o644); err != nil {
		slog.Error("🧠 Failed to write temp file", "path", tmpPath, "err", err)
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		slog.Error("🧠 Failed to rename temp file", "from", tmpPath, "to", path, "err", err)
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

// containsString checks if a []any slice contains a string value.
func containsString(slice []any, val string) bool {
	for _, v := range slice {
		if s, ok := v.(string); ok && s == val {
			return true
		}
	}
	return false
}

// removeString removes a string value from a []any slice.
func removeString(slice []any, val string) []any {
	var result []any
	for _, v := range slice {
		if s, ok := v.(string); ok && s == val {
			continue
		}
		result = append(result, v)
	}
	return result
}
