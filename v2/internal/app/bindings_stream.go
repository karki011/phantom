// bindings_stream.go exposes stream parsing and timeline APIs to the Wails frontend.
// Author: Subash Karki
package app

import (
	"fmt"
	"log"

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

// resolveJSONLPath locates the JSONL conversation file for a session
// using the active provider's FindConversationFile method.
func (a *App) resolveJSONLPath(sessionID string) (string, error) {
	if a.prov == nil {
		return "", fmt.Errorf("resolve jsonl: provider not initialised")
	}
	return a.prov.FindConversationFile(sessionID, "")
}
