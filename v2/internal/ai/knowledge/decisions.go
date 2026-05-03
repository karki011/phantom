// Package knowledge provides a unified interface for querying codebase knowledge.
// DecisionStore persists AI strategy decisions and their outcomes to SQLite,
// enabling historical lookup, similarity matching, and success rate queries.
//
// Author: Subash Karki
package knowledge

import (
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/ai/embedding"
)

// ErrInvalidDecision is returned when Record is called with empty required fields.
var ErrInvalidDecision = errors.New("decision goal and strategy_id must be non-empty")

// Decision records a strategy choice made for a specific goal.
type Decision struct {
	ID             string
	Goal           string
	StrategyID     string
	Confidence     float64
	Complexity     string
	Risk           string
	CreatedAt      time.Time
	AccessCount    int
	LastAccessedAt time.Time
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

// PhaseEvaluator marks rows written by the response evaluator — a diagnostic
// check that scans the assistant's text for hallucinated file paths. Kept for
// observability and future analysis but DELIBERATELY excluded from
// GetSuccessRate / GetFailedApproaches: a clean response (no hallucinations)
// doesn't mean the strategy succeeded, only that the LLM didn't fabricate
// paths. Mixing it into the verifier-driven learning signal would add noise.
const PhaseEvaluator = "evaluator"

// DecayConfig controls time-based exponential decay applied at query time to
// past outcomes. Successful outcomes decay faster (default 30 days) so the
// system stays open to trying alternatives; failed outcomes decay slower
// (default 90 days) so it remembers mistakes longer.
//
// Decay formula: weight = exp(-ln(2) * age_days / half_life)
type DecayConfig struct {
	// SuccessHalfLifeDays is the half-life for successful outcomes. After this
	// many days a success counts for half its original weight.
	SuccessHalfLifeDays float64

	// FailureHalfLifeDays is the half-life for failed outcomes. Longer than
	// success so the system avoids repeating mistakes.
	FailureHalfLifeDays float64
}

// DefaultDecayConfig returns the default decay configuration.
// Success decays in 30 days, failure in 90 days.
func DefaultDecayConfig() DecayConfig {
	return DecayConfig{
		SuccessHalfLifeDays: 30.0,
		FailureHalfLifeDays: 90.0,
	}
}

// outcomeDecayWeight computes exponential decay for an outcome row.
//
//	weight = exp(-ln(2) * age_days / half_life)
func (dc DecayConfig) outcomeDecayWeight(ageDays float64, success bool) float64 {
	if ageDays < 0 {
		ageDays = 0
	}
	halfLife := dc.FailureHalfLifeDays
	if success {
		halfLife = dc.SuccessHalfLifeDays
	}
	if halfLife <= 0 {
		halfLife = 30.0 // safety fallback
	}
	return math.Exp(-0.693 * ageDays / halfLife)
}

// DecisionStore provides CRUD access to AI decisions and outcomes.
type DecisionStore struct {
	db          *sql.DB
	vectorStore *embedding.VectorStore
	Decay       DecayConfig
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
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			access_count INTEGER NOT NULL DEFAULT 0,
			last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
	// Migrate existing databases: add access_count and last_accessed_at if missing.
	// SQLite's ADD COLUMN is idempotent-safe via "IF NOT EXISTS"-style error ignoring.
	db.Exec("ALTER TABLE ai_decisions ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0")
	db.Exec("ALTER TABLE ai_decisions ADD COLUMN last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP")
	return &DecisionStore{db: db, Decay: DefaultDecayConfig()}, nil
}

// DB returns the underlying database handle. Used by the orchestrator to look up
// outcome details for semantic matches without exposing full query helpers.
func (ds *DecisionStore) DB() *sql.DB {
	return ds.db
}

// SetVectorStore attaches a VectorStore for embedding decisions on Record().
// Nil-safe: passing nil disables semantic embedding.
func (ds *DecisionStore) SetVectorStore(vs *embedding.VectorStore) {
	ds.vectorStore = vs
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
		"INSERT INTO ai_decisions (id, goal, strategy_id, confidence, complexity, risk, access_count, last_accessed_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
		id, goal, strategyID, confidence, complexity, risk, time.Now().UTC(),
	)
	if err != nil {
		return id, err
	}

	// Embed the decision for semantic retrieval.
	if ds.vectorStore != nil {
		text := fmt.Sprintf("%s [strategy:%s complexity:%s risk:%s]", goal, strategyID, complexity, risk)
		if storeErr := ds.vectorStore.Store("decision", id, text); storeErr != nil {
			slog.Debug("embedding decision skipped", "id", id, "err", storeErr)
		}
	}

	return id, nil
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

// RecordEvaluatorOutcome persists a diagnostic outcome from the response
// evaluator (hallucinated-path scan). These rows are queryable for analysis
// but DO NOT feed GetSuccessRate / GetFailedApproaches — see PhaseEvaluator.
func (ds *DecisionStore) RecordEvaluatorOutcome(decisionID string, success bool, failureReason string) error {
	return ds.recordOutcomeWithPhase(decisionID, success, failureReason, PhaseEvaluator)
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
		"SELECT id, goal, strategy_id, confidence, complexity, risk, created_at, access_count, last_accessed_at FROM ai_decisions ORDER BY created_at DESC LIMIT ?",
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Decision
	for rows.Next() {
		var d Decision
		if err := rows.Scan(&d.ID, &d.Goal, &d.StrategyID, &d.Confidence, &d.Complexity, &d.Risk, &d.CreatedAt, &d.AccessCount, &d.LastAccessedAt); err != nil {
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
		"SELECT id, goal, strategy_id, confidence, complexity, risk, created_at, access_count, last_accessed_at FROM ai_decisions ORDER BY created_at DESC LIMIT 200",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	goalLower := strings.ToLower(goal)
	goalTrigrams := extractTrigrams(goalLower)
	goalTokens := tokenize(goal)

	now := time.Now()
	var results []scored
	for rows.Next() {
		var d Decision
		if err := rows.Scan(&d.ID, &d.Goal, &d.StrategyID, &d.Confidence, &d.Complexity, &d.Risk, &d.CreatedAt, &d.AccessCount, &d.LastAccessedAt); err != nil {
			LogError("decisions", "FindSimilar-scan", err)
			continue
		}
		textSim := combinedSimilarity(goalLower, goalTrigrams, goalTokens, d.Goal)
		finalScore := textSim * effectiveConfidence(d, now)
		if finalScore >= minSimilarity {
			results = append(results, scored{decision: d, score: finalScore})
		}
	}

	// Sort by score descending so the most relevant decisions come first.
	sortScoredDescending(results)

	out := make([]Decision, 0, min(len(results), limit))
	for i := 0; i < len(results) && i < limit; i++ {
		out = append(out, results[i].decision)
	}
	return out, nil
}

// FindSimilarSemantic uses the VectorStore for embedding-based similarity when
// available, falling back to trigram+Jaccard FindSimilar otherwise.
func (ds *DecisionStore) FindSimilarSemantic(goal string, topK int) ([]Decision, error) {
	if ds.vectorStore == nil {
		return ds.FindSimilar(goal, 0.3, topK)
	}
	memories, err := ds.vectorStore.FindSimilar(goal, topK, "decision")
	if err != nil {
		slog.Debug("semantic FindSimilar failed, falling back to trigram", "err", err)
		return ds.FindSimilar(goal, 0.3, topK)
	}
	if len(memories) == 0 {
		return nil, nil
	}

	// Convert memories back to Decision structs by loading from DB.
	out := make([]Decision, 0, len(memories))
	for _, m := range memories {
		var d Decision
		err := ds.db.QueryRow(
			"SELECT id, goal, strategy_id, confidence, complexity, risk, created_at, access_count, last_accessed_at FROM ai_decisions WHERE id = ?",
			m.SourceID,
		).Scan(&d.ID, &d.Goal, &d.StrategyID, &d.Confidence, &d.Complexity, &d.Risk, &d.CreatedAt, &d.AccessCount, &d.LastAccessedAt)
		if err != nil {
			continue // Decision may have been pruned — skip.
		}
		out = append(out, d)
	}
	return out, nil
}

// sortScoredDescending sorts scored decisions by score descending (insertion sort —
// N is small, capped at 200).
func sortScoredDescending(s []scored) {
	for i := 1; i < len(s); i++ {
		j := i
		for j > 0 && s[j].score > s[j-1].score {
			s[j], s[j-1] = s[j-1], s[j]
			j--
		}
	}
}

// scored is a Decision paired with its time-weighted similarity score.
type scored struct {
	decision Decision
	score    float64
}

// FailedApproach is a strategy+timestamp pair from a failed decision.
type FailedApproach struct {
	StrategyID string
	CreatedAt  time.Time
}

// GetFailedApproaches finds strategies that failed on goals similar to the
// given one. Only verifier-phase outcomes count — orchestrator-phase rows are
// optimistic auto-records and don't represent real failures.
//
// Failures are weighted by time decay (FailureHalfLifeDays). Failures whose
// decay weight drops below 0.05 (~4.3 half-lives, ~387 days at default 90d)
// are considered forgotten and excluded from results.
func (ds *DecisionStore) GetFailedApproaches(goal string) ([]FailedApproach, error) {
	similar, err := ds.FindSimilar(goal, 0.3)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	var failures []FailedApproach
	for _, d := range similar {
		var success int
		var outcomeCreatedAt time.Time
		err := ds.db.QueryRow(
			"SELECT success, created_at FROM ai_outcomes WHERE decision_id = ? AND phase = ? LIMIT 1",
			d.ID, PhaseVerifier,
		).Scan(&success, &outcomeCreatedAt)
		if err != nil || success != 0 {
			continue
		}
		ageDays := now.Sub(outcomeCreatedAt).Hours() / 24.0
		w := ds.Decay.outcomeDecayWeight(ageDays, false)
		if w >= 0.05 {
			failures = append(failures, FailedApproach{StrategyID: d.StrategyID, CreatedAt: d.CreatedAt})
		}
	}
	return failures, nil
}

// GetSuccessRate returns the time-decay-weighted success rate and total count
// for a strategy at a complexity. Only verifier-phase outcomes feed the rate —
// orchestrator-phase rows would skew it toward 100%.
//
// Each outcome is weighted by exponential decay based on its age:
//   - Successful outcomes use SuccessHalfLifeDays (default 30d)
//   - Failed outcomes use FailureHalfLifeDays (default 90d)
//
// This means recent outcomes matter more than old ones, and the system forgets
// successes faster than failures — keeping it open to alternatives while still
// avoiding known-bad strategies.
//
// Cold-start behaviour: when no verifier-phase rows exist for the strategy +
// complexity pair, returns (0, 0, nil). Callers (PerformanceStore weighting,
// etc.) treat zero-sample as "no signal" and fall back to neutral defaults
// rather than penalising untried strategies.
func (ds *DecisionStore) GetSuccessRate(strategyID string, complexity string) (float64, int, error) {
	rows, err := ds.db.Query(`
		SELECT o.success, o.created_at
		FROM ai_decisions d JOIN ai_outcomes o ON o.decision_id = d.id
		WHERE d.strategy_id = ? AND d.complexity = ? AND o.phase = ?
	`, strategyID, complexity, PhaseVerifier)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()

	now := time.Now()
	var weightedSuccesses, totalWeight float64
	var count int

	for rows.Next() {
		var success int
		var createdAt time.Time
		if err := rows.Scan(&success, &createdAt); err != nil {
			continue
		}
		ageDays := now.Sub(createdAt).Hours() / 24.0
		w := ds.Decay.outcomeDecayWeight(ageDays, success == 1)
		totalWeight += w
		if success == 1 {
			weightedSuccesses += w
		}
		count++
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}
	if count == 0 || totalWeight == 0 {
		return 0, 0, nil
	}
	return weightedSuccesses / totalWeight, count, nil
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

// --- Category-based confidence decay ---

// decayHalfLife returns the half-life in days for a given risk tier.
// Higher-risk decisions go stale faster because the codebase context they
// depend on changes more rapidly. User corrections are gold and decay slowly.
func decayHalfLife(risk string) float64 {
	switch risk {
	case "high":
		return 14.0
	case "medium":
		return 30.0
	case "low":
		return 60.0
	case "user-override":
		return 180.0
	default:
		return 30.0
	}
}

// effectiveConfidence calculates time-decayed, access-boosted confidence.
//
//	effective = base_confidence * exp(-age / half_life * ln2) * (1 + 0.1*ln(access+1))
//
// The result is capped at 1.0 so it stays a valid probability.
func effectiveConfidence(d Decision, now time.Time) float64 {
	ageDays := now.Sub(d.CreatedAt).Hours() / 24.0
	if ageDays < 0 {
		ageDays = 0
	}

	halfLife := decayHalfLife(d.Risk)
	decay := math.Exp(-ageDays / halfLife * 0.693)

	accessBoost := 1.0 + 0.1*math.Log(float64(d.AccessCount)+1.0)

	return math.Min(d.Confidence*decay*accessBoost, 1.0)
}

// IncrementAccess bumps the access counter and last-accessed timestamp for
// a decision. Call this whenever a past decision is referenced during
// strategy selection or failure-avoidance lookups.
func (ds *DecisionStore) IncrementAccess(id string) error {
	_, err := ds.db.Exec(
		"UPDATE ai_decisions SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?",
		time.Now().UTC(), id,
	)
	return err
}

// boolToInt converts a bool to 0 or 1 for SQLite storage.
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
