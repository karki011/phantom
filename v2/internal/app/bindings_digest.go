// bindings_digest.go — Wails binding for the AI Digest drawer.
// Aggregates session stats, strategies, and files touched for a given date.
// Author: Subash Karki
package app

import (
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/journal"
)

// DigestSummary is the frontend-facing payload for the AI Digest drawer.
type DigestSummary struct {
	Date           string   `json:"date"`
	SessionCount   int      `json:"sessionCount"`
	TotalTokens    int64    `json:"totalTokens"`
	EstimatedCost  float64  `json:"estimatedCost"`
	StrategiesUsed []string `json:"strategiesUsed"`
	FilesTouched   []string `json:"filesTouched"`
	TopStrategy    string   `json:"topStrategy"`
	Summary        string   `json:"summary"`
}

// GetDigestSummary returns an aggregated AI digest for the given date (YYYY-MM-DD).
// It queries sessions for token/cost/file data and the AI digest gatherer for
// strategy usage. Never returns an error — missing data yields sensible defaults.
func (a *App) GetDigestSummary(date string) DigestSummary {
	q := db.New(a.DB.Reader)

	sessions, err := q.ListSessionsByDate(a.ctx, sql.NullString{String: date, Valid: true})
	if err != nil {
		log.Error("app/bindings_digest: ListSessionsByDate", "date", date, "err", err)
		sessions = nil
	}

	var totalTokens int64
	var totalCostMicros int64
	filesSet := make(map[string]struct{})

	for _, s := range sessions {
		if s.InputTokens.Valid {
			totalTokens += s.InputTokens.Int64
		}
		if s.OutputTokens.Valid {
			totalTokens += s.OutputTokens.Int64
		}
		if s.EstimatedCostMicros.Valid {
			totalCostMicros += s.EstimatedCostMicros.Int64
		}
		// FilesTouched is stored as a JSON array string e.g. ["src/a.ts","src/b.go"]
		if s.FilesTouched.Valid && s.FilesTouched.String != "" {
			var files []string
			if json.Unmarshal([]byte(s.FilesTouched.String), &files) == nil {
				for _, f := range files {
					if f = strings.TrimSpace(f); f != "" {
						filesSet[f] = struct{}{}
					}
				}
			}
		}
	}

	// Deduplicated file list (stable order not guaranteed — that's fine)
	filesTouched := make([]string, 0, len(filesSet))
	for f := range filesSet {
		filesTouched = append(filesTouched, f)
	}
	if len(filesTouched) > 20 {
		filesTouched = filesTouched[:20]
	}

	// Strategy data from the AI digest gatherer (reads per-project knowledge DBs)
	var strategiesUsed []string
	var topStrategy string

	gatherer := journal.NewAIDigestGatherer(q, a.DB.Reader)
	aiData := gatherer.GatherAIDigestData(a.ctx, date)
	for _, s := range aiData.Strategies {
		strategiesUsed = append(strategiesUsed, s.Name)
	}
	if len(aiData.Strategies) > 0 {
		topStrategy = aiData.Strategies[0].Name
	}

	// Build a compact prose summary from the journal generator (deterministic, no AI call)
	gen := a.getJournalGenerator()
	projects := a.getProjectInfos()
	summary := gen.GenerateEndOfDay(a.ctx, projects)

	// Trim summary to a readable length for the drawer
	if len(summary) > 500 {
		summary = summary[:500] + "..."
	}

	return DigestSummary{
		Date:           date,
		SessionCount:   len(sessions),
		TotalTokens:    totalTokens,
		EstimatedCost:  float64(totalCostMicros) / 1_000_000,
		StrategiesUsed: strategiesUsed,
		FilesTouched:   filesTouched,
		TopStrategy:    topStrategy,
		Summary:        summary,
	}
}
