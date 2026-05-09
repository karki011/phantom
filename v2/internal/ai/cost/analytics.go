// Package cost — aggregation queries for cost analytics.
// Queries sessions + ai_decisions to build daily cost reports without touching
// the orchestrator or strategy pipeline.
//
// Author: Subash Karki
package cost

import (
	"database/sql"
	"fmt"
)

// SessionCostSummary is the per-session cost breakdown.
type SessionCostSummary struct {
	SessionID     string  `json:"sessionId"`
	Model         string  `json:"model"`
	InputTokens   int64   `json:"inputTokens"`
	OutputTokens  int64   `json:"outputTokens"`
	EstimatedCost float64 `json:"estimatedCost"`
}

// DailyCostReport aggregates cost signals for a single calendar day.
type DailyCostReport struct {
	Date             string             `json:"date"`
	TotalCost        float64            `json:"totalCost"`
	TotalTokens      int64              `json:"totalTokens"`
	SessionCount     int                `json:"sessionCount"`
	CostByModel      map[string]float64 `json:"costByModel"`
	CostByStrategy   map[string]float64 `json:"costByStrategy"`
	StrategyWinRates map[string]float64 `json:"strategyWinRates"`
	CostModelVersion string             `json:"costModelVersion"`
}

// sessionRow is an internal scan target for session queries.
type sessionRow struct {
	id               string
	model            sql.NullString
	inputTokens      sql.NullInt64
	outputTokens     sql.NullInt64
	cacheReadTokens  sql.NullInt64
	cacheWriteTokens sql.NullInt64
	costMicros       sql.NullInt64
}

// decisionRow is an internal scan target for ai_decisions queries.
type decisionRow struct {
	strategyID string
	confidence float64
	successSum int
	totalCount int
}

// GenerateDailyReport creates a cost report for a given date (YYYY-MM-DD).
// It queries the sessions and ai_decisions tables directly via the passed *sql.DB.
// Never panics — missing or empty data yields sensible zero-value defaults.
func GenerateDailyReport(db *sql.DB, date string) (*DailyCostReport, error) {
	if db == nil {
		return nil, fmt.Errorf("cost: nil database")
	}

	report := &DailyCostReport{
		Date:             date,
		CostByModel:      make(map[string]float64),
		CostByStrategy:   make(map[string]float64),
		StrategyWinRates: make(map[string]float64),
		CostModelVersion: CostModelVersion,
	}

	// --- Sessions for the day ---
	// date column is stored as YYYY-MM-DD; fall back to strftime on started_at
	// so we work even when date is unpopulated.
	rows, err := db.Query(`
		SELECT id, model, input_tokens, output_tokens, cache_read_tokens,
		       cache_write_tokens, estimated_cost_micros
		FROM sessions
		WHERE date = ?
		   OR (date IS NULL AND strftime('%Y-%m-%d', started_at/1000, 'unixepoch') = ?)
	`, date, date)
	if err != nil {
		return report, fmt.Errorf("cost: query sessions: %w", err)
	}
	defer rows.Close()

	var sessions []sessionRow
	for rows.Next() {
		var r sessionRow
		if err := rows.Scan(
			&r.id, &r.model, &r.inputTokens, &r.outputTokens,
			&r.cacheReadTokens, &r.cacheWriteTokens, &r.costMicros,
		); err != nil {
			continue
		}
		sessions = append(sessions, r)
	}
	if err := rows.Err(); err != nil {
		return report, fmt.Errorf("cost: iterate sessions: %w", err)
	}

	report.SessionCount = len(sessions)

	for _, s := range sessions {
		inTok := s.inputTokens.Int64
		outTok := s.outputTokens.Int64
		crTok := s.cacheReadTokens.Int64
		cwTok := s.cacheWriteTokens.Int64
		report.TotalTokens += inTok + outTok

		model := ""
		if s.model.Valid {
			model = s.model.String
		}

		// Prefer stored cost_micros when available (watcher already did the math).
		// Re-estimate with our price table when absent or zero — handles sessions
		// recorded before cost_micros was populated.
		var sessionCost float64
		if s.costMicros.Valid && s.costMicros.Int64 > 0 {
			sessionCost = float64(s.costMicros.Int64) / 1_000_000
		} else if model != "" {
			sessionCost = EstimateCost(model, inTok, outTok, crTok, cwTok)
		}

		report.TotalCost += sessionCost

		if model != "" {
			report.CostByModel[model] += sessionCost
		}
	}

	// --- Strategy costs from ai_decisions for the same day ---
	// We assign cost proportionally: each decision row is one "strategy invocation".
	// We use the session's average cost-per-token to weight strategy costs —
	// without per-decision token counts we can't do better than count-weighting.
	decRows, err := db.Query(`
		SELECT strategy_id, confidence
		FROM ai_decisions
		WHERE date(created_at) = ?
	`, date)
	if err == nil {
		defer decRows.Close()
		type stratEntry struct{ count int; confSum float64 }
		stratMap := make(map[string]*stratEntry)
		totalDecisions := 0
		for decRows.Next() {
			var sid string
			var conf float64
			if err := decRows.Scan(&sid, &conf); err != nil {
				continue
			}
			if _, ok := stratMap[sid]; !ok {
				stratMap[sid] = &stratEntry{}
			}
			stratMap[sid].count++
			stratMap[sid].confSum += conf
			totalDecisions++
		}

		// Distribute total cost proportionally by decision count.
		if totalDecisions > 0 && report.TotalCost > 0 {
			for sid, e := range stratMap {
				report.CostByStrategy[sid] = report.TotalCost * float64(e.count) / float64(totalDecisions)
			}
		}
	}

	// --- Strategy win rates from ai_decisions + ai_outcomes ---
	// Only verifier-phase outcomes count (matches the knowledge store convention).
	winRows, err := db.Query(`
		SELECT d.strategy_id,
		       SUM(CASE WHEN o.success = 1 THEN 1 ELSE 0 END) as wins,
		       COUNT(o.id) as total
		FROM ai_decisions d
		JOIN ai_outcomes o ON o.decision_id = d.id
		WHERE o.phase = 'verifier'
		  AND date(d.created_at) = ?
		GROUP BY d.strategy_id
	`, date)
	if err == nil {
		defer winRows.Close()
		for winRows.Next() {
			var sid string
			var wins, total int
			if err := winRows.Scan(&sid, &wins, &total); err != nil {
				continue
			}
			if total > 0 {
				report.StrategyWinRates[sid] = float64(wins) / float64(total)
			}
		}
	}

	return report, nil
}
