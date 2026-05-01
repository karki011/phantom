// Package knowledge provides a unified interface for querying codebase knowledge.
// Compactor synthesizes patterns from decision history, prunes stale data,
// and produces a health score for the knowledge store.
//
// Author: Subash Karki
package knowledge

import (
	"crypto/sha256"
	"database/sql"
	"fmt"
	"math"
	"time"
)

const (
	// PatternMinSamples is the minimum decision count before a pattern is synthesized.
	PatternMinSamples = 5
	// PruneTTL is how long unsuccessful decisions are retained.
	PruneTTL = 7 * 24 * time.Hour
	// DemoteThreshold marks patterns below this success rate as deprecated.
	DemoteThreshold = 0.4
	// DisableThreshold flags strategies that may need disabling at a given complexity.
	DisableThreshold = 0.3
)

// CompactedPattern represents a synthesized insight from repeated decisions.
type CompactedPattern struct {
	ID           string
	StrategyID   string
	Complexity   string
	Risk         string
	SuccessRate  float64
	SampleSize   int
	Status       string // "active" or "deprecated"
	DiscoveredAt time.Time
}

// KnowledgeHealth summarizes the overall health of the knowledge store.
type KnowledgeHealth struct {
	TotalDecisions     int
	ActivePatterns     int
	DeprecatedPatterns int
	AvgSuccessRate     float64
	StaleDecisions     int
	HealthScore        float64 // 0-1
}

// Compactor compacts decisions into patterns and prunes stale data.
type Compactor struct {
	db *sql.DB
}

// NewCompactor creates a Compactor and ensures the ai_patterns table exists.
func NewCompactor(db *sql.DB) (*Compactor, error) {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS ai_patterns (
			id TEXT PRIMARY KEY,
			strategy_id TEXT NOT NULL,
			complexity TEXT NOT NULL,
			risk TEXT NOT NULL,
			success_rate REAL NOT NULL,
			sample_size INTEGER NOT NULL,
			status TEXT NOT NULL DEFAULT 'active',
			discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		return nil, err
	}
	return &Compactor{db: db}, nil
}

// Run executes a full compaction cycle: synthesize, prune, then demote.
func (c *Compactor) Run() error {
	if err := c.synthesizePatterns(); err != nil {
		return fmt.Errorf("synthesize: %w", err)
	}
	if err := c.pruneStale(); err != nil {
		return fmt.Errorf("prune: %w", err)
	}
	if err := c.demoteFailingPatterns(); err != nil {
		return fmt.Errorf("demote: %w", err)
	}
	return nil
}

// synthesizePatterns groups decisions by (strategy_id, complexity, risk) and
// creates or updates patterns for groups with enough samples. Only verifier-
// phase outcomes feed pattern math — orchestrator-phase auto-records would
// inflate sample size with optimistic always-success rows.
func (c *Compactor) synthesizePatterns() error {
	rows, err := c.db.Query(`
		SELECT d.strategy_id, d.complexity, d.risk,
			   COUNT(*) AS total,
			   COALESCE(SUM(CASE WHEN o.success = 1 THEN 1 ELSE 0 END), 0) AS successes
		FROM ai_decisions d
		JOIN ai_outcomes o ON o.decision_id = d.id
		WHERE o.phase = ?
		GROUP BY d.strategy_id, d.complexity, d.risk
		HAVING COUNT(*) >= ?
	`, PhaseVerifier, PatternMinSamples)
	if err != nil {
		return err
	}

	// Collect all rows before closing the cursor. SQLite does not support
	// concurrent read-cursor + write on the same connection, so we must
	// finish reading before executing any INSERT/UPDATE.
	type patternRow struct {
		strategyID  string
		complexity  string
		risk        string
		total       int
		successes   int
	}
	var pending []patternRow
	for rows.Next() {
		var r patternRow
		if err := rows.Scan(&r.strategyID, &r.complexity, &r.risk, &r.total, &r.successes); err != nil {
			LogError("compactor", "synthesize-scan", err)
			rows.Close()
			return err
		}
		pending = append(pending, r)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, r := range pending {
		successRate := float64(r.successes) / float64(r.total)
		patternID := patternKey(r.strategyID, r.complexity, r.risk)

		status := "active"
		if successRate < DemoteThreshold {
			status = "deprecated"
		}

		_, err := c.db.Exec(`
			INSERT INTO ai_patterns (id, strategy_id, complexity, risk, success_rate, sample_size, status, discovered_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(id) DO UPDATE SET
				success_rate = excluded.success_rate,
				sample_size  = excluded.sample_size,
				status       = excluded.status
		`, patternID, r.strategyID, r.complexity, r.risk, successRate, r.total, status)
		if err != nil {
			return err
		}
	}
	return nil
}

// pruneStale deletes outcomes and then decisions older than PruneTTL that
// have no successful verifier-phase outcome. Successful decisions are kept
// regardless of age. Orchestrator-phase auto-records don't count as success
// here — every decision has one (always written as `true`), so a non-phase-
// aware check would never prune anything.
func (c *Compactor) pruneStale() error {
	cutoff := time.Now().Add(-PruneTTL)

	// Delete orphan outcomes for decisions that will be pruned.
	_, err := c.db.Exec(`
		DELETE FROM ai_outcomes WHERE decision_id IN (
			SELECT d.id FROM ai_decisions d
			WHERE d.created_at < ?
			AND d.id NOT IN (
				SELECT o.decision_id FROM ai_outcomes o WHERE o.success = 1 AND o.phase = ?
			)
		)
	`, cutoff, PhaseVerifier)
	if err != nil {
		return err
	}

	// Delete the stale decisions themselves.
	_, err = c.db.Exec(`
		DELETE FROM ai_decisions
		WHERE created_at < ?
		AND id NOT IN (
			SELECT decision_id FROM ai_outcomes WHERE success = 1 AND phase = ?
		)
	`, cutoff, PhaseVerifier)
	return err
}

// demoteFailingPatterns marks patterns with success_rate < DemoteThreshold as deprecated.
// For strategies below DisableThreshold it sets status to "deprecated" as a flag
// for the gap detector (no auto-disable).
func (c *Compactor) demoteFailingPatterns() error {
	_, err := c.db.Exec(`
		UPDATE ai_patterns SET status = 'deprecated'
		WHERE success_rate < ?
	`, DemoteThreshold)
	return err
}

// Health returns a snapshot of the knowledge store's health.
func (c *Compactor) Health() (KnowledgeHealth, error) {
	var h KnowledgeHealth

	if err := c.db.QueryRow("SELECT COUNT(*) FROM ai_decisions").Scan(&h.TotalDecisions); err != nil {
		return h, err
	}
	if err := c.db.QueryRow("SELECT COUNT(*) FROM ai_patterns WHERE status = 'active'").Scan(&h.ActivePatterns); err != nil {
		return h, err
	}
	if err := c.db.QueryRow("SELECT COUNT(*) FROM ai_patterns WHERE status = 'deprecated'").Scan(&h.DeprecatedPatterns); err != nil {
		return h, err
	}

	// Average only over verifier-phase rows. Orchestrator-phase rows are
	// always success=1 by design, so blending them would push AvgSuccessRate
	// toward 1.0 regardless of real-world signal.
	var avgRate sql.NullFloat64
	if err := c.db.QueryRow(
		"SELECT AVG(CAST(success AS REAL)) FROM ai_outcomes WHERE phase = ?",
		PhaseVerifier,
	).Scan(&avgRate); err != nil {
		return h, err
	}
	if avgRate.Valid {
		h.AvgSuccessRate = avgRate.Float64
	}

	cutoff := time.Now().Add(-PruneTTL)
	if err := c.db.QueryRow(`
		SELECT COUNT(*) FROM ai_decisions d
		WHERE d.created_at < ?
		AND d.id NOT IN (SELECT decision_id FROM ai_outcomes)
	`, cutoff).Scan(&h.StaleDecisions); err != nil {
		return h, err
	}

	// Composite health score.
	score := 0.0
	if h.ActivePatterns > 0 {
		score += 0.3
	}
	score += h.AvgSuccessRate * 0.4
	if h.StaleDecisions == 0 {
		score += 0.3
	} else {
		score += math.Max(0, 0.3-float64(h.StaleDecisions)*0.03)
	}
	h.HealthScore = score

	return h, nil
}

// ShouldRun returns true when compaction is worthwhile (100+ uncompacted decisions).
func (c *Compactor) ShouldRun() (bool, error) {
	var total int
	if err := c.db.QueryRow("SELECT COUNT(*) FROM ai_decisions").Scan(&total); err != nil {
		return false, err
	}

	var compacted int
	if err := c.db.QueryRow("SELECT COALESCE(SUM(sample_size), 0) FROM ai_patterns").Scan(&compacted); err != nil {
		return false, err
	}

	return total-compacted >= 100, nil
}

// patternKey produces a deterministic ID from the grouping columns.
func patternKey(strategyID, complexity, risk string) string {
	h := sha256.Sum256([]byte(strategyID + "|" + complexity + "|" + risk))
	return fmt.Sprintf("pat-%x", h[:8])
}
