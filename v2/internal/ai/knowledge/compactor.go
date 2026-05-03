// Package knowledge provides a unified interface for querying codebase knowledge.
// Compactor synthesizes patterns from decision history, prunes stale data,
// and produces a health score for the knowledge store.
//
// Author: Subash Karki
package knowledge

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/ai/embedding"
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

	// ConsolidateCooldown is the minimum interval between LLM consolidation runs.
	ConsolidateCooldown = 120 * time.Second
	// MaxClustersPerRun caps how many clusters are sent to the LLM per compaction.
	MaxClustersPerRun = 10
	// MinClusterSize is the minimum number of decisions to form a consolidation cluster.
	MinClusterSize = 3
	// SimilarityThreshold is the minimum cosine similarity for cluster membership.
	SimilarityThreshold = 0.85
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
// When a HaikuClient is set, it also runs LLM-powered semantic deduplication
// to consolidate similar decisions into richer patterns.
type Compactor struct {
	db              *sql.DB
	vectorStore     *embedding.VectorStore
	haikuClient     *HaikuClient
	lastConsolidate time.Time
}

// SetVectorStore attaches a VectorStore for embedding patterns on synthesis
// and cleaning up stale decision embeddings on prune. Nil-safe.
func (c *Compactor) SetVectorStore(vs *embedding.VectorStore) {
	c.vectorStore = vs
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

	// Migrate: add LLM consolidation columns (idempotent — errors ignored on existing columns).
	db.Exec("ALTER TABLE ai_patterns ADD COLUMN description TEXT DEFAULT ''")
	db.Exec("ALTER TABLE ai_patterns ADD COLUMN conditions TEXT DEFAULT '[]'")
	db.Exec("ALTER TABLE ai_patterns ADD COLUMN failure_modes TEXT DEFAULT '[]'")
	db.Exec("ALTER TABLE ai_patterns ADD COLUMN source TEXT DEFAULT 'sql'")
	db.Exec("ALTER TABLE ai_patterns ADD COLUMN last_consolidated_at DATETIME")

	// Consolidation audit log.
	db.Exec(`
		CREATE TABLE IF NOT EXISTS ai_consolidation_log (
			id TEXT PRIMARY KEY,
			pattern_id TEXT NOT NULL,
			decisions_consumed TEXT NOT NULL,
			input_tokens INTEGER DEFAULT 0,
			output_tokens INTEGER DEFAULT 0,
			cost_usd REAL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)

	return &Compactor{db: db}, nil
}

// SetHaikuClient attaches a HaikuClient for LLM-powered consolidation.
// Nil-safe: passing nil disables LLM dedup.
func (c *Compactor) SetHaikuClient(hc *HaikuClient) {
	c.haikuClient = hc
}

// Run executes a full compaction cycle: synthesize, prune, demote, LLM
// consolidate (if available), then prune expired embeddings.
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

	// LLM-powered semantic dedup — additive, non-fatal.
	if c.haikuClient != nil && time.Since(c.lastConsolidate) > ConsolidateCooldown {
		stats, err := c.RunLLMConsolidation()
		if err != nil {
			slog.Warn("llm consolidation skipped", "err", err)
		} else if stats.ClustersProcessed > 0 {
			slog.Info("llm consolidation complete",
				"clusters", stats.ClustersProcessed,
				"patterns_created", stats.PatternsCreated,
				"decisions_consumed", stats.DecisionsConsumed)
		}
		c.lastConsolidate = time.Now()
	}

	// Prune expired embeddings alongside knowledge compaction.
	if c.vectorStore != nil {
		pruned, pruneErr := c.vectorStore.PruneExpired()
		if pruneErr != nil {
			slog.Warn("failed to prune expired embeddings", "err", pruneErr)
		} else if pruned > 0 {
			slog.Info("pruned expired embeddings", "count", pruned)
		}
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

		// Embed pattern for semantic retrieval.
		if c.vectorStore != nil {
			text := fmt.Sprintf("strategy:%s complexity:%s risk:%s success:%.2f", r.strategyID, r.complexity, r.risk, successRate)
			if storeErr := c.vectorStore.Store("pattern", patternID, text); storeErr != nil {
				slog.Debug("embedding pattern skipped", "id", patternID, "err", storeErr)
			}
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

	// Collect IDs of decisions that will be pruned so we can clean up embeddings.
	var staleIDs []string
	if c.vectorStore != nil {
		rows, err := c.db.Query(`
			SELECT d.id FROM ai_decisions d
			WHERE d.created_at < ?
			AND d.id NOT IN (
				SELECT o.decision_id FROM ai_outcomes o WHERE o.success = 1 AND o.phase = ?
			)
		`, cutoff, PhaseVerifier)
		if err == nil {
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					staleIDs = append(staleIDs, id)
				}
			}
			rows.Close()
		}
	}

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
	if err != nil {
		return err
	}

	// Clean up embeddings for pruned decisions.
	if c.vectorStore != nil && len(staleIDs) > 0 {
		for _, id := range staleIDs {
			_ = c.vectorStore.Delete("decision", id)
		}
		slog.Info("pruned stale decision embeddings", "count", len(staleIDs))
	}

	return nil
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

// --- LLM consolidation ---

const consolidationSystemPrompt = `You consolidate similar AI strategy decisions into one pattern.
Output ONLY valid JSON. No markdown, no explanation, no code fences.
Schema:
{
  "consolidated_pattern": {
    "strategy_id": "string — the winning strategy",
    "description": "string — 1-2 sentence insight about when/why this works",
    "success_rate": 0.85,
    "conditions": ["when this works"],
    "failure_modes": ["when this fails"],
    "sample_size": 15
  },
  "decisions_consumed": ["id1", "id2"]
}`

// ConsolidationStats tracks what happened during a consolidation run.
type ConsolidationStats struct {
	ClustersProcessed int
	PatternsCreated   int
	DecisionsConsumed int
}

// DecisionCluster groups semantically similar decisions for LLM consolidation.
type DecisionCluster struct {
	Decisions []Decision
	Outcomes  map[string][]Outcome // keyed by decision ID
}

// RunLLMConsolidation finds semantic clusters and sends them to Haiku for
// consolidation. Returns stats about what was processed. Safe to call when
// haikuClient or vectorStore is nil (returns zero stats).
func (c *Compactor) RunLLMConsolidation() (ConsolidationStats, error) {
	var stats ConsolidationStats

	if c.haikuClient == nil || c.vectorStore == nil {
		return stats, nil
	}

	clusters := c.findSemanticClusters()
	if len(clusters) == 0 {
		return stats, nil
	}
	if len(clusters) > MaxClustersPerRun {
		clusters = clusters[:MaxClustersPerRun]
	}

	ctx := context.Background()
	for _, cluster := range clusters {
		prompt := buildClusterPrompt(cluster)
		text, inTok, outTok, err := c.haikuClient.Call(ctx, consolidationSystemPrompt, prompt)
		if err != nil {
			slog.Warn("haiku consolidation call failed",
				"err", err, "cluster_size", len(cluster.Decisions))
			continue
		}

		result, err := parseConsolidation(text)
		if err != nil {
			slog.Warn("haiku response unparseable", "err", err)
			continue
		}

		// Validate consumed IDs are a subset of the input cluster.
		clusterIDs := make(map[string]bool, len(cluster.Decisions))
		for _, d := range cluster.Decisions {
			clusterIDs[d.ID] = true
		}
		var validConsumed []string
		for _, id := range result.DecisionsConsumed {
			if clusterIDs[id] {
				validConsumed = append(validConsumed, id)
			}
		}
		if len(validConsumed) == 0 {
			slog.Warn("haiku consumed no valid decision IDs, skipping cluster")
			continue
		}
		result.DecisionsConsumed = validConsumed

		if err := c.applyConsolidation(result, inTok, outTok); err != nil {
			slog.Warn("apply consolidation failed", "err", err)
			continue
		}

		stats.ClustersProcessed++
		stats.PatternsCreated++
		stats.DecisionsConsumed += len(validConsumed)
	}

	return stats, nil
}

// findSemanticClusters discovers groups of semantically similar decisions
// using embedding-based cosine similarity from the VectorStore.
func (c *Compactor) findSemanticClusters() []DecisionCluster {
	if c.vectorStore == nil {
		return nil
	}

	rows, err := c.db.Query(`
		SELECT id, goal, strategy_id, confidence, complexity, risk
		FROM ai_decisions
		WHERE created_at > datetime('now', '-30 days')
		ORDER BY created_at DESC
		LIMIT 500
	`)
	if err != nil {
		slog.Warn("findSemanticClusters query failed", "err", err)
		return nil
	}
	defer rows.Close()

	var decisions []Decision
	for rows.Next() {
		var d Decision
		if err := rows.Scan(&d.ID, &d.Goal, &d.StrategyID, &d.Confidence, &d.Complexity, &d.Risk); err != nil {
			continue
		}
		decisions = append(decisions, d)
	}
	if err := rows.Err(); err != nil {
		return nil
	}

	visited := make(map[string]bool)
	var clusters []DecisionCluster

	for _, d := range decisions {
		if visited[d.ID] {
			continue
		}

		similar, err := c.vectorStore.FindSimilar(d.Goal, 20, "decision")
		if err != nil {
			continue
		}

		// Build lookup from VectorStore results.
		similarSourceIDs := make(map[string]float64, len(similar))
		for _, mem := range similar {
			similarSourceIDs[mem.SourceID] = mem.Score
		}

		// Match back to our decision list, filtering by similarity threshold.
		var members []Decision
		for _, dd := range decisions {
			if visited[dd.ID] {
				continue
			}
			// The anchor decision itself is always included.
			if dd.ID == d.ID {
				members = append(members, dd)
				continue
			}
			if score, ok := similarSourceIDs[dd.ID]; ok && score >= SimilarityThreshold {
				members = append(members, dd)
			}
		}

		if len(members) >= MinClusterSize {
			cluster := DecisionCluster{
				Decisions: members,
				Outcomes:  c.loadOutcomesForDecisions(members),
			}
			clusters = append(clusters, cluster)
			for _, m := range members {
				visited[m.ID] = true
			}
		}
	}

	return clusters
}

// loadOutcomesForDecisions loads verifier-phase outcomes for each decision.
func (c *Compactor) loadOutcomesForDecisions(decisions []Decision) map[string][]Outcome {
	outcomes := make(map[string][]Outcome, len(decisions))
	for _, d := range decisions {
		rows, err := c.db.Query(
			"SELECT decision_id, success, failure_reason, phase FROM ai_outcomes WHERE decision_id = ? AND phase = ?",
			d.ID, PhaseVerifier,
		)
		if err != nil {
			continue
		}
		for rows.Next() {
			var o Outcome
			var successInt int
			if rows.Scan(&o.DecisionID, &successInt, &o.FailureReason, &o.Phase) == nil {
				o.Success = successInt == 1
				outcomes[d.ID] = append(outcomes[d.ID], o)
			}
		}
		rows.Close()
	}
	return outcomes
}

// buildClusterPrompt creates the user prompt for Haiku consolidation.
func buildClusterPrompt(cluster DecisionCluster) string {
	var b strings.Builder
	fmt.Fprintf(&b, "These %d decisions share similar goals and strategies. Consolidate them into one pattern.\n\n", len(cluster.Decisions))
	fmt.Fprintln(&b, "Decisions:")

	for _, d := range cluster.Decisions {
		fmt.Fprintf(&b, "- ID: %s\n  Goal: %q\n  Strategy: %s\n  Complexity: %s | Risk: %s\n",
			d.ID, d.Goal, d.StrategyID, d.Complexity, d.Risk)
		if outcomes, ok := cluster.Outcomes[d.ID]; ok {
			for _, o := range outcomes {
				fmt.Fprintf(&b, "  Outcome: success=%v reason=%q phase=%s\n",
					o.Success, o.FailureReason, o.Phase)
			}
		}
		b.WriteString("\n")
	}

	b.WriteString("Rules:\n")
	b.WriteString("1. Pick the winning strategy (highest success rate, most samples)\n")
	b.WriteString("2. Synthesize conditions that predict success vs failure\n")
	b.WriteString("3. Aggregate the sample size\n")
	b.WriteString("4. List ALL decision IDs being consumed\n")
	return b.String()
}

// applyConsolidation writes the consolidated pattern and removes consumed decisions.
func (c *Compactor) applyConsolidation(result *ConsolidationResult, inTok, outTok int) error {
	complexity := extractConditionValue(result.Pattern.Conditions, "complexity")
	risk := extractConditionValue(result.Pattern.Conditions, "risk")
	if complexity == "" {
		complexity = "medium"
	}
	if risk == "" {
		risk = "medium"
	}

	patternID := patternKey(result.Pattern.StrategyID, complexity, risk)

	condJSON, _ := json.Marshal(result.Pattern.Conditions)
	failJSON, _ := json.Marshal(result.Pattern.FailureModes)
	consumedJSON, _ := json.Marshal(result.DecisionsConsumed)

	// Upsert the consolidated pattern.
	_, err := c.db.Exec(`
		INSERT INTO ai_patterns (id, strategy_id, complexity, risk, success_rate, sample_size,
								 status, description, conditions, failure_modes, source, last_consolidated_at)
		VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, 'llm', CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO UPDATE SET
			success_rate = excluded.success_rate,
			sample_size = excluded.sample_size,
			description = excluded.description,
			conditions = excluded.conditions,
			failure_modes = excluded.failure_modes,
			source = 'llm',
			last_consolidated_at = CURRENT_TIMESTAMP
	`, patternID, result.Pattern.StrategyID, complexity, risk,
		result.Pattern.SuccessRate, result.Pattern.SampleSize,
		result.Pattern.Description, string(condJSON), string(failJSON))
	if err != nil {
		return fmt.Errorf("upsert pattern: %w", err)
	}

	// Log the consolidation for audit.
	logID := uuid.New().String()
	costUSD := float64(inTok)*0.80/1_000_000 + float64(outTok)*4.00/1_000_000
	_, _ = c.db.Exec(`
		INSERT INTO ai_consolidation_log (id, pattern_id, decisions_consumed, input_tokens, output_tokens, cost_usd)
		VALUES (?, ?, ?, ?, ?, ?)
	`, logID, patternID, string(consumedJSON), inTok, outTok, costUSD)

	// Delete consumed decisions and their outcomes/embeddings.
	for _, id := range result.DecisionsConsumed {
		c.db.Exec("DELETE FROM ai_outcomes WHERE decision_id = ?", id)
		c.db.Exec("DELETE FROM ai_decisions WHERE id = ?", id)
		if c.vectorStore != nil {
			_ = c.vectorStore.Delete("decision", id)
		}
	}

	// Embed the new pattern for semantic retrieval.
	if c.vectorStore != nil {
		text := fmt.Sprintf("pattern: %s — %s", result.Pattern.StrategyID, result.Pattern.Description)
		if storeErr := c.vectorStore.Store("pattern", patternID, text); storeErr != nil {
			slog.Debug("embedding consolidated pattern skipped", "id", patternID, "err", storeErr)
		}
	}

	return nil
}

// extractConditionValue looks for "key:value" in a conditions list and returns the value.
func extractConditionValue(conditions []string, key string) string {
	prefix := key + ":"
	for _, c := range conditions {
		if strings.HasPrefix(c, prefix) {
			return strings.TrimPrefix(c, prefix)
		}
	}
	return ""
}
