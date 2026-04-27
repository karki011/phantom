// Package knowledge provides a unified interface for querying codebase knowledge.
// It aggregates data from the project detector, collector activity, and session
// context into a single queryable API used by the graph context provider.
//
// Author: Subash Karki
package knowledge

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/db"
)

// Store provides read access to codebase knowledge from the database.
type Store struct {
	queries *db.Queries
	rawDB   db.DBTX
}

// NewStore creates a Store backed by the given DB connections.
func NewStore(queries *db.Queries, rawDB db.DBTX) *Store {
	return &Store{queries: queries, rawDB: rawDB}
}

// SessionSummary holds a concise summary of a session's activity.
type SessionSummary struct {
	ID           string   `json:"id"`
	Repo         string   `json:"repo"`
	Branch       string   `json:"branch"`
	FilesTouched []string `json:"files_touched"`
	Summary      string   `json:"summary"`
	ToolsUsed    []string `json:"tools_used"`
}

// GetSessionSummary returns a concise summary of a session's activity.
func (s *Store) GetSessionSummary(ctx context.Context, sessionID string) (*SessionSummary, error) {
	sess, err := s.queries.GetSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	summary := &SessionSummary{ID: sessionID}

	if sess.Repo.Valid {
		summary.Repo = sess.Repo.String
	}
	if sess.FirstPrompt.Valid {
		summary.Summary = sess.FirstPrompt.String
		if len(summary.Summary) > 200 {
			summary.Summary = summary.Summary[:200] + "..."
		}
	}

	// Extract branch from enrichment data.
	row := s.rawDB.QueryRowContext(ctx,
		`SELECT branch FROM sessions WHERE id = ? AND branch IS NOT NULL AND branch != ''`,
		sessionID)
	var branch string
	if err := row.Scan(&branch); err == nil {
		summary.Branch = branch
	}

	// Extract files touched from enrichment data.
	row = s.rawDB.QueryRowContext(ctx,
		`SELECT files_touched FROM sessions WHERE id = ? AND files_touched IS NOT NULL`,
		sessionID)
	var filesJSON string
	if err := row.Scan(&filesJSON); err == nil && filesJSON != "" {
		var files []string
		if json.Unmarshal([]byte(filesJSON), &files) == nil {
			summary.FilesTouched = files
		}
	}

	// Extract unique tool names from recent activity.
	summary.ToolsUsed = s.recentTools(ctx, sessionID)

	return summary, nil
}

// recentTools returns the unique tool names used in a session (last 100 events).
func (s *Store) recentTools(ctx context.Context, sessionID string) []string {
	activities, err := s.queries.ListRecentActivity(ctx, db.ListRecentActivityParams{
		SessionID: sql.NullString{String: sessionID, Valid: true},
		Column2:   sessionID,
		Limit:     100,
	})
	if err != nil {
		return nil
	}

	seen := make(map[string]struct{})
	var tools []string

	for _, a := range activities {
		if !strings.HasPrefix(a.Type, "tool:") {
			continue
		}
		toolName := strings.TrimPrefix(a.Type, "tool:")
		if _, ok := seen[toolName]; !ok {
			seen[toolName] = struct{}{}
			tools = append(tools, toolName)
		}
	}

	return tools
}
