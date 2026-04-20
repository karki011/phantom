// bindings_stream.go exposes stream parsing and timeline APIs to the Wails frontend.
// Author: Subash Karki
package app

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// GetSessionEvents returns paginated stream events for a session.
func (a *App) GetSessionEvents(sessionID string, offset, limit int) []stream.Event {
	if a.Stream == nil {
		return []stream.Event{}
	}
	if limit <= 0 {
		limit = 100
	}
	events, err := a.Stream.GetEvents(a.ctx, sessionID, offset, limit)
	if err != nil {
		log.Printf("app/bindings_stream: GetSessionEvents(%s): %v", sessionID, err)
		return []stream.Event{}
	}
	return events
}

// GetSessionTimeline returns the condensed timeline for a session.
func (a *App) GetSessionTimeline(sessionID string) *stream.Timeline {
	if a.Stream == nil {
		return nil
	}
	tl, err := a.Stream.GetTimeline(a.ctx, sessionID)
	if err != nil {
		log.Printf("app/bindings_stream: GetSessionTimeline(%s): %v", sessionID, err)
		return nil
	}
	return tl
}

// StartStreamSession resolves the JSONL path for a session and begins live tailing.
func (a *App) StartStreamSession(sessionID string) error {
	if a.Stream == nil {
		return fmt.Errorf("stream service not initialised")
	}
	jsonlPath, err := a.resolveJSONLPath(sessionID)
	if err != nil {
		return fmt.Errorf("start stream: %w", err)
	}
	return a.Stream.StartTailing(a.ctx, sessionID, jsonlPath)
}

// StopStreamSession stops live tailing for a session.
func (a *App) StopStreamSession(sessionID string) error {
	if a.Stream == nil {
		return fmt.Errorf("stream service not initialised")
	}
	a.Stream.StopTailing(sessionID)
	return nil
}

// ParseSessionHistory performs a full batch parse of a session's JSONL file
// and returns the number of events stored.
func (a *App) ParseSessionHistory(sessionID string) (int, error) {
	if a.Stream == nil {
		return 0, fmt.Errorf("stream service not initialised")
	}
	jsonlPath, err := a.resolveJSONLPath(sessionID)
	if err != nil {
		return 0, fmt.Errorf("parse history: %w", err)
	}
	return a.Stream.ParseSession(a.ctx, sessionID, jsonlPath)
}

// resolveJSONLPath walks ~/.claude/projects/ to find the JSONL file for a session.
func (a *App) resolveJSONLPath(sessionID string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve jsonl: %w", err)
	}

	root := filepath.Join(home, ".claude", "projects")
	target := sessionID + ".jsonl"

	var found string
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil || d.IsDir() {
			return nil
		}
		if strings.EqualFold(d.Name(), target) {
			found = path
			return filepath.SkipAll
		}
		return nil
	})

	if found == "" {
		return "", fmt.Errorf("JSONL file not found for session %s", sessionID)
	}
	return found, nil
}
