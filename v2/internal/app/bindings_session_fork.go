// bindings_session_fork.go exposes session-fork (clone-as-new-session) to the
// Wails frontend. Forking a session clones its on-disk transcript under a new
// session ID and inserts a new sessions row that records the parent.
//
// Author: Subash Karki
package app

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/db"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// EventSessionForked is emitted after a successful fork so the frontend can
// reconcile its session list.
const EventSessionForked = "session:forked"

// ForkSession clones the transcript of an existing session under a new session
// ID and records the lineage in the database. The provider must support fork
// (currently only Claude). Returns the new session ID on success.
//
// name is optional; reserved for embedding a friendly name in the new session.
func (a *App) ForkSession(sessionID, name string) (string, error) {
	if sessionID == "" {
		return "", fmt.Errorf("sessionID is required")
	}
	if a.DB == nil {
		return "", fmt.Errorf("database not initialised")
	}
	if a.provRegistry == nil {
		return "", fmt.Errorf("provider registry not initialised")
	}

	ctx := context.Background()

	// Look up the source session to determine the provider and inherit metadata.
	q := db.New(a.DB.Reader)
	src, err := q.GetSession(ctx, sessionID)
	if err != nil {
		return "", fmt.Errorf("get source session %q: %w", sessionID, err)
	}

	providerName := src.Provider
	if providerName == "" {
		return "", fmt.Errorf("source session %q has no provider", sessionID)
	}

	prov, ok := a.provRegistry.Get(providerName)
	if !ok {
		return "", fmt.Errorf("provider %q not found", providerName)
	}
	if !prov.SupportsFork() {
		return "", fmt.Errorf("provider %q does not support fork", providerName)
	}

	cwd := ""
	if src.Cwd.Valid {
		cwd = src.Cwd.String
	}

	newID, err := prov.ForkConversation(sessionID, cwd, name)
	if err != nil {
		return "", fmt.Errorf("fork transcript: %w", err)
	}

	// Insert the new session row inheriting metadata but starting fresh on
	// counters. The session watcher will reconcile token counts and message
	// counts once it observes the new transcript.
	now := time.Now().Unix()
	newName := src.Name
	if name != "" {
		newName = sql.NullString{String: name, Valid: true}
	}

	writer := db.New(a.DB.Writer)
	if err := writer.ForkSession(ctx, db.ForkSessionParams{
		ID:              newID,
		ParentSessionID: sql.NullString{String: sessionID, Valid: true},
		Pid:             sql.NullInt64{}, // forks start without a live PID
		Cwd:             src.Cwd,
		Repo:            src.Repo,
		Name:            newName,
		Kind:            src.Kind,
		Model:           src.Model,
		Entrypoint:      src.Entrypoint,
		StartedAt:       sql.NullInt64{Int64: now, Valid: true},
		EndedAt:         sql.NullInt64{}, // not ended
		Status:          sql.NullString{String: "active", Valid: true},
		Provider:        providerName,
	}); err != nil {
		slog.Error("ForkSession: insert row failed", "session_id", newID, "parent", sessionID, "err", err)
		return "", fmt.Errorf("insert forked session row: %w", err)
	}

	if a.ctx != nil {
		wailsRuntime.EventsEmit(a.ctx, EventSessionForked, map[string]string{
			"session_id":        newID,
			"parent_session_id": sessionID,
		})
	}

	return newID, nil
}
