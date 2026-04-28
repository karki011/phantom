// bindings_ai_insight.go exposes AI engine insight data to the Wails frontend.
// Provides real-time strategy status, task assessment, context coverage,
// knowledge stats, and recent decisions for the AI Insight Panel.
//
// Author: Subash Karki
package app

import (
	"database/sql"
	"time"

	"github.com/charmbracelet/log"
)

// AIInsightData is the top-level payload returned to the frontend.
type AIInsightData struct {
	Strategy       StrategyInfo    `json:"strategy"`
	Assessment     AssessmentInfo  `json:"assessment"`
	Context        ContextCoverage `json:"context"`
	Knowledge      KnowledgeStats  `json:"knowledge"`
	RecentDecisions []DecisionEntry `json:"recent_decisions"`
}

// StrategyInfo describes the currently active AI strategy.
type StrategyInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// AssessmentInfo holds the latest task assessment scores.
type AssessmentInfo struct {
	Complexity     string  `json:"complexity"`
	Risk           string  `json:"risk"`
	AmbiguityScore float64 `json:"ambiguity_score"`
	IsAmbiguous    bool    `json:"is_ambiguous"`
	FileCount      int     `json:"file_count"`
	BlastRadius    int     `json:"blast_radius"`
}

// ContextCoverage reports how much of the project is indexed.
type ContextCoverage struct {
	FilesIndexed   int     `json:"files_indexed"`
	SymbolsIndexed int     `json:"symbols_indexed"`
	EdgeCount      int     `json:"edge_count"`
	CoveragePercent float64 `json:"coverage_percent"`
}

// KnowledgeStats holds aggregate decision/pattern metrics.
type KnowledgeStats struct {
	DecisionsRecorded int     `json:"decisions_recorded"`
	PatternsDiscovered int    `json:"patterns_discovered"`
	SuccessRate       float64 `json:"success_rate"`
}

// DecisionEntry is a recent AI decision with its outcome.
type DecisionEntry struct {
	ID         string `json:"id"`
	Goal       string `json:"goal"`
	StrategyID string `json:"strategy_id"`
	Complexity string `json:"complexity"`
	Risk       string `json:"risk"`
	Success    *bool  `json:"success"`
	CreatedAt  string `json:"created_at"`
}

// GetAIInsight returns the full AI engine insight payload for the frontend panel.
func (a *App) GetAIInsight() *AIInsightData {
	data := &AIInsightData{
		Strategy: StrategyInfo{
			ID:   "direct",
			Name: "Direct Execution",
		},
		Assessment: AssessmentInfo{
			Complexity: "simple",
			Risk:       "low",
		},
	}

	// Context coverage from file graph indexers.
	var totalSourceFiles int
	a.fileIndexersMu.RLock()
	for _, ix := range a.fileIndexers {
		g := ix.Graph()
		files, symbols, edges := g.Stats()
		data.Context.FilesIndexed += files
		data.Context.SymbolsIndexed += symbols
		data.Context.EdgeCount += edges
		totalSourceFiles += ix.TotalSourceFiles()
	}
	a.fileIndexersMu.RUnlock()

	// Coverage = indexed files / total parseable source files in the project.
	if totalSourceFiles > 0 {
		data.Context.CoveragePercent = float64(data.Context.FilesIndexed) / float64(totalSourceFiles) * 100
		if data.Context.CoveragePercent > 100 {
			data.Context.CoveragePercent = 100
		}
	} else if data.Context.FilesIndexed > 0 {
		data.Context.CoveragePercent = 100 // All indexed files are source files
	}

	// Knowledge stats from ai_decisions table.
	if a.DB != nil {
		data.Knowledge = a.queryKnowledgeStats()
		data.RecentDecisions = a.queryRecentDecisions(5)
	}

	return data
}

// queryKnowledgeStats reads aggregate decision metrics from SQLite.
func (a *App) queryKnowledgeStats() KnowledgeStats {
	stats := KnowledgeStats{}

	row := a.DB.Reader.QueryRowContext(a.ctx,
		`SELECT COUNT(*) FROM ai_decisions`)
	if err := row.Scan(&stats.DecisionsRecorded); err != nil {
		log.Debug("ai insight: count decisions", "err", err)
	}

	// Unique strategy IDs used = "patterns discovered".
	row = a.DB.Reader.QueryRowContext(a.ctx,
		`SELECT COUNT(DISTINCT strategy_id) FROM ai_decisions`)
	if err := row.Scan(&stats.PatternsDiscovered); err != nil {
		log.Debug("ai insight: count patterns", "err", err)
	}

	// Overall success rate.
	var total, successes int
	row = a.DB.Reader.QueryRowContext(a.ctx,
		`SELECT COUNT(*), COALESCE(SUM(CASE WHEN o.success = 1 THEN 1 ELSE 0 END), 0)
		 FROM ai_decisions d LEFT JOIN ai_outcomes o ON o.decision_id = d.id
		 WHERE o.id IS NOT NULL`)
	if err := row.Scan(&total, &successes); err != nil {
		log.Debug("ai insight: success rate", "err", err)
	}
	if total > 0 {
		stats.SuccessRate = float64(successes) / float64(total) * 100
	}

	return stats
}

// queryRecentDecisions fetches the last N decisions with their outcomes.
func (a *App) queryRecentDecisions(limit int) []DecisionEntry {
	rows, err := a.DB.Reader.QueryContext(a.ctx, `
		SELECT d.id, d.goal, d.strategy_id, d.complexity, d.risk, d.created_at,
		       o.success
		FROM ai_decisions d
		LEFT JOIN ai_outcomes o ON o.decision_id = d.id
		ORDER BY d.created_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		log.Debug("ai insight: recent decisions", "err", err)
		return nil
	}
	defer rows.Close()

	var entries []DecisionEntry
	for rows.Next() {
		var e DecisionEntry
		var createdAt time.Time
		var success sql.NullInt64

		if err := rows.Scan(&e.ID, &e.Goal, &e.StrategyID, &e.Complexity, &e.Risk, &createdAt, &success); err != nil {
			continue
		}
		e.CreatedAt = createdAt.Format(time.RFC3339)
		if success.Valid {
			s := success.Int64 == 1
			e.Success = &s
		}
		entries = append(entries, e)
	}
	return entries
}
