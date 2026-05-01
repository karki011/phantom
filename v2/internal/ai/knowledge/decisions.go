// Package knowledge provides a unified interface for querying codebase knowledge.
// DecisionStore persists AI strategy decisions and their outcomes to SQLite,
// enabling historical lookup, similarity matching, and success rate queries.
//
// Author: Subash Karki
package knowledge

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ErrInvalidDecision is returned when Record is called with empty required fields.
var ErrInvalidDecision = errors.New("decision goal and strategy_id must be non-empty")

// Decision records a strategy choice made for a specific goal.
type Decision struct {
	ID         string
	Goal       string
	StrategyID string
	Confidence float64
	Complexity string
	Risk       string
	CreatedAt  time.Time
}

// Outcome records whether a decision succeeded or failed.
type Outcome struct {
	DecisionID    string
	Success       bool
	FailureReason string
	// Phase identifies which writer produced the row. See PhaseOrchestrator /
	// PhaseVerifier — used by GetSuccessRate / GetFailedApproaches to ignore
	// optimistic auto-records when ground-truth verifier rows exist.
	Phase string
}

// PhaseOrchestrator marks rows written by the orchestrator's optimistic
// auto-record (strategy selection didn't crash) — kept for observability but
// excluded from learning-loop math when verifier rows are available.
const PhaseOrchestrator = "orchestrator"

// PhaseVerifier marks rows written by a real pass/fail signal (Composer's
// post-turn typecheck/test verifier, MCP feedback API). Drives GetSuccessRate
// and GetFailedApproaches by default.
const PhaseVerifier = "verifier"

// DecisionStore provides CRUD access to AI decisions and outcomes.
type DecisionStore struct {
	db *sql.DB
}

// NewDecisionStore creates a DecisionStore and ensures the schema exists.
// The `phase` column is NOT NULL DEFAULT 'orchestrator' so existing rows from
// pre-phase installs backfill correctly (every row before this column landed
// was orchestrator-written).
func NewDecisionStore(db *sql.DB) (*DecisionStore, error) {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS ai_decisions (
			id TEXT PRIMARY KEY,
			goal TEXT NOT NULL,
			strategy_id TEXT NOT NULL,
			confidence REAL DEFAULT 0,
			complexity TEXT DEFAULT '',
			risk TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS ai_outcomes (
			id TEXT PRIMARY KEY,
			decision_id TEXT REFERENCES ai_decisions(id),
			success INTEGER NOT NULL DEFAULT 0,
			failure_reason TEXT DEFAULT '',
			phase TEXT NOT NULL DEFAULT 'orchestrator',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_decisions_goal ON ai_decisions(goal);
		CREATE INDEX IF NOT EXISTS idx_outcomes_decision ON ai_outcomes(decision_id);
		CREATE INDEX IF NOT EXISTS idx_outcomes_phase ON ai_outcomes(phase);
	`)
	if err != nil {
		return nil, err
	}
	return &DecisionStore{db: db}, nil
}

// Record persists a new decision and returns its ID.
// Rejects writes with empty goal or strategyID to prevent corrupting the
// ai_decisions table — past callers have leaked zero-value Decisions.
func (ds *DecisionStore) Record(goal, strategyID string, confidence float64, complexity, risk string) (string, error) {
	if strings.TrimSpace(goal) == "" || strings.TrimSpace(strategyID) == "" {
		LogError("decisions", "Record-empty-fields", ErrInvalidDecision, "goal="+goal+" strategy_id="+strategyID)
		return "", ErrInvalidDecision
	}
	id := uuid.New().String()
	_, err := ds.db.Exec(
		"INSERT INTO ai_decisions (id, goal, strategy_id, confidence, complexity, risk) VALUES (?, ?, ?, ?, ?, ?)",
		id, goal, strategyID, confidence, complexity, risk,
	)
	return id, err
}

// RecordOutcome persists a verifier-phase outcome (ground-truth pass/fail
// from the project verifier or an explicit feedback API call). Most callers
// want this — see RecordOrchestratorOutcome for the optimistic auto-record
// path used inside the orchestrator's selection pipeline.
func (ds *DecisionStore) RecordOutcome(decisionID string, success bool, failureReason string) error {
	return ds.recordOutcomeWithPhase(decisionID, success, failureReason, PhaseVerifier)
}

// RecordOrchestratorOutcome persists the orchestrator's optimistic auto-record
// (strategy selection completed without crashing). These rows are kept for
// observability but excluded from GetSuccessRate / GetFailedApproaches by
// default — they don't represent real success, only that the picker ran.
func (ds *DecisionStore) RecordOrchestratorOutcome(decisionID string, success bool, failureReason string) error {
	return ds.recordOutcomeWithPhase(decisionID, success, failureReason, PhaseOrchestrator)
}

// recordOutcomeWithPhase is the single INSERT path. Both public Record* methods
// delegate here so the wire shape stays consistent and writers can't forget
// the phase tag.
func (ds *DecisionStore) recordOutcomeWithPhase(decisionID string, success bool, failureReason, phase string) error {
	id := uuid.New().String()
	_, err := ds.db.Exec(
		"INSERT INTO ai_outcomes (id, decision_id, success, failure_reason, phase) VALUES (?, ?, ?, ?, ?)",
		id, decisionID, boolToInt(success), failureReason, phase,
	)
	return err
}

// ListRecent returns the most recently recorded decisions, newest first.
// Pass 0 (or a non-positive value) to use the default limit of 20.
func (ds *DecisionStore) ListRecent(limit int) ([]Decision, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := ds.db.Query(
		"SELECT id, goal, strategy_id, confidence, complexity, risk, created_at FROM ai_decisions ORDER BY created_at DESC LIMIT ?",
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Decision
	for rows.Next() {
		var d Decision
		if err := rows.Scan(&d.ID, &d.Goal, &d.StrategyID, &d.Confidence, &d.Complexity, &d.Risk, &d.CreatedAt); err != nil {
			LogError("decisions", "ListRecent-scan", err)
			continue
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// FindSimilar returns past decisions whose goals are similar to the given goal.
// Uses combined trigram + token Jaccard similarity (trigram-weighted) for better
// semantic matching — "refactor auth" matches "restructure login flow" via shared
// character trigrams even when words don't overlap.
//
// The limit parameter caps the number of results returned. Pass 0 for default (20).
func (ds *DecisionStore) FindSimilar(goal string, minSimilarity float64, limits ...int) ([]Decision, error) {
	limit := 20
	if len(limits) > 0 && limits[0] > 0 {
		limit = limits[0]
	}

	rows, err := ds.db.Query(
		"SELECT id, goal, strategy_id, confidence, complexity, risk, created_at FROM ai_decisions ORDER BY created_at DESC LIMIT 200",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	goalLower := strings.ToLower(goal)
	goalTrigrams := extractTrigrams(goalLower)
	goalTokens := tokenize(goal)

	var results []Decision
	for rows.Next() {
		var d Decision
		if err := rows.Scan(&d.ID, &d.Goal, &d.StrategyID, &d.Confidence, &d.Complexity, &d.Risk, &d.CreatedAt); err != nil {
			LogError("decisions", "FindSimilar-scan", err)
			continue
		}
		sim := combinedSimilarity(goalLower, goalTrigrams, goalTokens, d.Goal)
		if sim >= minSimilarity {
			results = append(results, d)
		}
	}

	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

// FailedApproach is a strategy+timestamp pair from a failed decision.
type FailedApproach struct {
	StrategyID string
	CreatedAt  time.Time
}

// GetFailedApproaches finds strategies that failed on goals similar to the
// given one. Only verifier-phase outcomes count — orchestrator-phase rows are
// optimistic auto-records and don't represent real failures.
func (ds *DecisionStore) GetFailedApproaches(goal string) ([]FailedApproach, error) {
	similar, err := ds.FindSimilar(goal, 0.3)
	if err != nil {
		return nil, err
	}

	var failures []FailedApproach
	for _, d := range similar {
		var success int
		err := ds.db.QueryRow(
			"SELECT success FROM ai_outcomes WHERE decision_id = ? AND phase = ? LIMIT 1",
			d.ID, PhaseVerifier,
		).Scan(&success)
		if err == nil && success == 0 {
			failures = append(failures, FailedApproach{StrategyID: d.StrategyID, CreatedAt: d.CreatedAt})
		}
	}
	return failures, nil
}

// GetSuccessRate returns the success rate and total count for a strategy at a
// complexity. Only verifier-phase outcomes feed the rate — orchestrator-phase
// rows would skew it toward 100% (they're auto-recorded as success the moment
// strategy selection completes, before the LLM has done anything).
//
// Cold-start behaviour: when no verifier-phase rows exist for the strategy +
// complexity pair, returns (0, 0, nil). Callers (PerformanceStore weighting,
// etc.) treat zero-sample as "no signal" and fall back to neutral defaults
// rather than penalising untried strategies.
func (ds *DecisionStore) GetSuccessRate(strategyID string, complexity string) (float64, int, error) {
	var total, successes int
	err := ds.db.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(CASE WHEN o.success = 1 THEN 1 ELSE 0 END), 0)
		FROM ai_decisions d JOIN ai_outcomes o ON o.decision_id = d.id
		WHERE d.strategy_id = ? AND d.complexity = ? AND o.phase = ?
	`, strategyID, complexity, PhaseVerifier).Scan(&total, &successes)
	if err != nil || total == 0 {
		return 0, 0, err
	}
	return float64(successes) / float64(total), total, nil
}

// jaccardSimilarity computes the Jaccard index between two token sets.
func jaccardSimilarity(a, b map[string]bool) float64 {
	if len(a) == 0 && len(b) == 0 {
		return 1.0
	}
	intersection, union := 0, 0
	for k := range a {
		union++
		if b[k] {
			intersection++
		}
	}
	for k := range b {
		if !a[k] {
			union++
		}
	}
	if union == 0 {
		return 0
	}
	return float64(intersection) / float64(union)
}

// stopWords are common English words excluded from tokenization.
var stopWords = map[string]bool{
	"the": true, "a": true, "an": true, "is": true, "it": true,
	"to": true, "in": true, "for": true, "of": true, "and": true,
	"or": true, "this": true, "that": true, "with": true,
}

// tokenize splits text into a set of meaningful lowercase tokens.
func tokenize(text string) map[string]bool {
	tokens := make(map[string]bool)
	for _, word := range strings.Fields(strings.ToLower(text)) {
		w := strings.Trim(word, ".,!?;:\"'()[]{}")
		if len(w) > 1 && !stopWords[w] {
			tokens[w] = true
		}
	}
	return tokens
}

// extractTrigrams returns the set of 3-character substrings from a lowercased string.
// Punctuation and whitespace are preserved so character-level patterns are captured.
func extractTrigrams(s string) map[string]bool {
	trigrams := make(map[string]bool)
	runes := []rune(s)
	for i := 0; i <= len(runes)-3; i++ {
		trigrams[string(runes[i:i+3])] = true
	}
	return trigrams
}

// trigramSimilarity computes Jaccard similarity on character trigrams.
// "refactor" and "restructure" share trigrams like "ruct", "uctu", "ctur", "ture"
// which gives much better matching than word-level Jaccard.
func trigramSimilarity(a, b string) float64 {
	return jaccardSimilarity(extractTrigrams(a), extractTrigrams(b))
}

// combinedSimilarity blends trigram similarity (70% weight) with token-level
// Jaccard (30% weight) for robust matching that captures both character-level
// and word-level overlap.
func combinedSimilarity(goalLower string, goalTrigrams, goalTokens map[string]bool, candidateGoal string) float64 {
	candidateLower := strings.ToLower(candidateGoal)
	candidateTrigrams := extractTrigrams(candidateLower)
	candidateTokens := tokenize(candidateGoal)

	triSim := jaccardSimilarity(goalTrigrams, candidateTrigrams)
	tokSim := jaccardSimilarity(goalTokens, candidateTokens)

	return 0.7*triSim + 0.3*tokSim
}

// boolToInt converts a bool to 0 or 1 for SQLite storage.
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
