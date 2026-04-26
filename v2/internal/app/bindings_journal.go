// Wails bindings for Activity Journal — session enrichment and daily stats.
// Author: Subash Karki
package app

import (
	"database/sql"

	"github.com/charmbracelet/log"

	"github.com/subashkarki/phantom-os-v2/internal/db"
)

// JournalEntry is the frontend-facing journal data for a session.
// It unwraps sql.Null* types from the generated Session struct.
type JournalEntry struct {
	ID                  string `json:"id"`
	Date                string `json:"date"`
	Summary             string `json:"summary"`
	Outcome             string `json:"outcome"`
	FilesTouched        string `json:"files_touched"`
	GitCommits          int64  `json:"git_commits"`
	GitLinesAdded       int64  `json:"git_lines_added"`
	GitLinesRemoved     int64  `json:"git_lines_removed"`
	Branch              string `json:"branch"`
	PrUrl               string `json:"pr_url"`
	PrStatus            string `json:"pr_status"`
	Model               string `json:"model"`
	Repo                string `json:"repo"`
	Cwd                 string `json:"cwd"`
	StartedAt           int64  `json:"started_at"`
	EndedAt             int64  `json:"ended_at"`
	Status              string `json:"status"`
	InputTokens         int64  `json:"input_tokens"`
	OutputTokens        int64  `json:"output_tokens"`
	EstimatedCostMicros int64  `json:"estimated_cost_micros"`
	MessageCount        int64  `json:"message_count"`
	ToolUseCount        int64  `json:"tool_use_count"`
	FirstPrompt         string `json:"first_prompt"`
	ToolBreakdown       string `json:"tool_breakdown"`
}

// DailyStatsEntry is the frontend-facing daily rollup.
type DailyStatsEntry struct {
	Date              string `json:"date"`
	ProjectID         string `json:"project_id"`
	SessionCount      int64  `json:"session_count"`
	TotalDuration     int64  `json:"total_duration_secs"`
	TotalCostMicros   int64  `json:"total_cost_micros"`
	TotalInputTokens  int64  `json:"total_input_tokens"`
	TotalOutputTokens int64  `json:"total_output_tokens"`
	TotalToolCalls    int64  `json:"total_tool_calls"`
	TotalCommits      int64  `json:"total_commits"`
	PrCount           int64  `json:"pr_count"`
	TopFiles          string `json:"top_files"`
}

// sessionToJournalEntry converts a sqlc-generated Session to a frontend-facing JournalEntry.
func sessionToJournalEntry(s db.Session) JournalEntry {
	return JournalEntry{
		ID:                  s.ID,
		Date:                stringOrEmpty(s.Date),
		Summary:             stringOrEmpty(s.Summary),
		Outcome:             stringOrEmpty(s.Outcome),
		FilesTouched:        stringOrEmpty(s.FilesTouched),
		GitCommits:          int64OrZero(s.GitCommits),
		GitLinesAdded:       int64OrZero(s.GitLinesAdded),
		GitLinesRemoved:     int64OrZero(s.GitLinesRemoved),
		Branch:              stringOrEmpty(s.Branch),
		PrUrl:               stringOrEmpty(s.PrUrl),
		PrStatus:            stringOrEmpty(s.PrStatus),
		Model:               stringOrEmpty(s.Model),
		Repo:                stringOrEmpty(s.Repo),
		Cwd:                 stringOrEmpty(s.Cwd),
		StartedAt:           int64OrZero(s.StartedAt),
		EndedAt:             int64OrZero(s.EndedAt),
		Status:              stringOrEmpty(s.Status),
		InputTokens:         int64OrZero(s.InputTokens),
		OutputTokens:        int64OrZero(s.OutputTokens),
		EstimatedCostMicros: int64OrZero(s.EstimatedCostMicros),
		MessageCount:        int64OrZero(s.MessageCount),
		ToolUseCount:        int64OrZero(s.ToolUseCount),
		FirstPrompt:         stringOrEmpty(s.FirstPrompt),
		ToolBreakdown:       stringOrEmpty(s.ToolBreakdown),
	}
}

// dailyStatsToEntry converts a sqlc-generated DailyStat to a frontend-facing DailyStatsEntry.
func dailyStatsToEntry(s db.DailyStat) DailyStatsEntry {
	return DailyStatsEntry{
		Date:              s.Date,
		ProjectID:         stringOrEmpty(s.ProjectID),
		SessionCount:      int64OrZero(s.SessionCount),
		TotalDuration:     int64OrZero(s.TotalDurationSecs),
		TotalCostMicros:   int64OrZero(s.TotalCostMicros),
		TotalInputTokens:  int64OrZero(s.TotalInputTokens),
		TotalOutputTokens: int64OrZero(s.TotalOutputTokens),
		TotalToolCalls:    int64OrZero(s.TotalToolCalls),
		TotalCommits:      int64OrZero(s.TotalCommits),
		PrCount:           int64OrZero(s.PrCount),
		TopFiles:          stringOrEmpty(s.TopFiles),
	}
}

// int64OrZero unwraps a sql.NullInt64, returning 0 if null.
func int64OrZero(n sql.NullInt64) int64 {
	if n.Valid {
		return n.Int64
	}
	return 0
}

// GetSessionsByDate returns all sessions for a specific day.
func (a *App) GetSessionsByDate(date string) []JournalEntry {
	q := db.New(a.DB.Reader)
	sessions, err := q.ListSessionsByDate(a.ctx, sql.NullString{String: date, Valid: true})
	if err != nil {
		log.Error("app/bindings_journal: ListSessionsByDate", "date", date, "err", err)
		return []JournalEntry{}
	}
	entries := make([]JournalEntry, 0, len(sessions))
	for _, s := range sessions {
		entries = append(entries, sessionToJournalEntry(s))
	}
	return entries
}

// GetSessionsByProject returns recent sessions for a project repo path.
func (a *App) GetSessionsByProject(repo string, limit int) []JournalEntry {
	if limit <= 0 {
		limit = 50
	}
	q := db.New(a.DB.Reader)
	sessions, err := q.ListSessionsByProject(a.ctx, db.ListSessionsByProjectParams{
		Repo:  sql.NullString{String: repo, Valid: true},
		Limit: int64(limit),
	})
	if err != nil {
		log.Error("app/bindings_journal: ListSessionsByProject", "repo", repo, "err", err)
		return []JournalEntry{}
	}
	entries := make([]JournalEntry, 0, len(sessions))
	for _, s := range sessions {
		entries = append(entries, sessionToJournalEntry(s))
	}
	return entries
}

// GetRecentSessions returns the most recent completed/active sessions.
func (a *App) GetRecentSessions(limit int) []JournalEntry {
	if limit <= 0 {
		limit = 20
	}
	q := db.New(a.DB.Reader)
	sessions, err := q.ListRecentSessions(a.ctx, int64(limit))
	if err != nil {
		log.Error("app/bindings_journal: ListRecentSessions", "limit", limit, "err", err)
		return []JournalEntry{}
	}
	entries := make([]JournalEntry, 0, len(sessions))
	for _, s := range sessions {
		entries = append(entries, sessionToJournalEntry(s))
	}
	return entries
}

// GetDailyStatsRange returns global daily stats for a date range (calendar heatmap).
func (a *App) GetDailyStatsRange(startDate, endDate string) []DailyStatsEntry {
	q := db.New(a.DB.Reader)
	stats, err := q.ListDailyStatsRange(a.ctx, db.ListDailyStatsRangeParams{
		Date:   startDate,
		Date_2: endDate,
	})
	if err != nil {
		log.Error("app/bindings_journal: ListDailyStatsRange", "start", startDate, "end", endDate, "err", err)
		return []DailyStatsEntry{}
	}
	entries := make([]DailyStatsEntry, 0, len(stats))
	for _, s := range stats {
		entries = append(entries, dailyStatsToEntry(s))
	}
	return entries
}

// GetDailyStatsRangeByProject returns daily stats for a specific project over a date range.
func (a *App) GetDailyStatsRangeByProject(startDate, endDate, projectId string) []DailyStatsEntry {
	q := db.New(a.DB.Reader)
	stats, err := q.ListDailyStatsRangeByProject(a.ctx, db.ListDailyStatsRangeByProjectParams{
		Date:      startDate,
		Date_2:    endDate,
		ProjectID: sql.NullString{String: projectId, Valid: true},
	})
	if err != nil {
		log.Error("app/bindings_journal: ListDailyStatsRangeByProject", "start", startDate, "end", endDate, "project", projectId, "err", err)
		return []DailyStatsEntry{}
	}
	entries := make([]DailyStatsEntry, 0, len(stats))
	for _, s := range stats {
		entries = append(entries, dailyStatsToEntry(s))
	}
	return entries
}

// GetLastActiveSession returns the most recently started active/completed session, or nil.
func (a *App) GetLastActiveSession() *JournalEntry {
	q := db.New(a.DB.Reader)
	session, err := q.GetLastActiveSession(a.ctx)
	if err != nil {
		if err != sql.ErrNoRows {
			log.Error("app/bindings_journal: GetLastActiveSession", "err", err)
		}
		return nil
	}
	entry := sessionToJournalEntry(session)
	return &entry
}
