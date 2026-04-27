// Wails bindings for session, task, and activity queries.
// Author: Subash Karki
package app

import (
	"database/sql"
	"log"

	"github.com/subashkarki/phantom-os-v2/internal/db"
)

// GetSessions returns all sessions ordered by started_at DESC.
func (a *App) GetSessions() []db.Session {
	q := db.New(a.DB.Reader)
	sessions, err := q.ListSessions(a.ctx)
	if err != nil {
		log.Printf("app/bindings_sessions: ListSessions error: %v", err)
		return []db.Session{}
	}
	return sessions
}

// GetActiveSessions returns only sessions with status = 'active'.
func (a *App) GetActiveSessions() []db.Session {
	q := db.New(a.DB.Reader)
	sessions, err := q.ListActiveSessions(a.ctx)
	if err != nil {
		log.Printf("app/bindings_sessions: ListActiveSessions error: %v", err)
		return []db.Session{}
	}
	return sessions
}

// GetSession returns a single session by ID, or nil if not found.
func (a *App) GetSession(id string) *db.Session {
	q := db.New(a.DB.Reader)
	session, err := q.GetSession(a.ctx, id)
	if err != nil {
		if err != sql.ErrNoRows {
			log.Printf("app/bindings_sessions: GetSession(%s) error: %v", id, err)
		}
		return nil
	}
	return &session
}

// GetSessionTasks returns all tasks for a given session.
func (a *App) GetSessionTasks(sessionId string) []db.Task {
	q := db.New(a.DB.Reader)
	tasks, err := q.ListTasksBySession(a.ctx, sql.NullString{String: sessionId, Valid: true})
	if err != nil {
		log.Printf("app/bindings_sessions: ListTasksBySession(%s) error: %v", sessionId, err)
		return []db.Task{}
	}
	return tasks
}

// GetSessionsByProvider returns all sessions for a given provider (e.g. "claude", "codex").
func (a *App) GetSessionsByProvider(provider string) []db.Session {
	q := db.New(a.DB.Reader)
	sessions, err := q.ListSessionsByProvider(a.ctx, provider)
	if err != nil {
		log.Printf("app/bindings_sessions: ListSessionsByProvider(%s) error: %v", provider, err)
		return []db.Session{}
	}
	return sessions
}

// GetActivityLog returns recent activity entries for a session.
// Pass an empty sessionId to get activity across all sessions.
func (a *App) GetActivityLog(sessionId string, limit int) []db.ActivityLog {
	if limit <= 0 {
		limit = 50
	}

	q := db.New(a.DB.Reader)

	params := db.ListRecentActivityParams{
		Limit: int64(limit),
	}
	if sessionId != "" {
		params.SessionID = sql.NullString{String: sessionId, Valid: true}
		params.Column2 = sessionId
	}

	activities, err := q.ListRecentActivity(a.ctx, params)
	if err != nil {
		log.Printf("app/bindings_sessions: ListRecentActivity(%s, %d) error: %v", sessionId, limit, err)
		return []db.ActivityLog{}
	}
	return activities
}
