// ai_digest.go — Aggregates AI engine data for journal entries.
// Queries per-project KnowledgeDB SQLite databases and the main DB for
// gamification stats. All queries are fail-safe: missing data yields
// sensible defaults, never errors.
// Author: Subash Karki
package journal

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"github.com/subashkarki/phantom-os-v2/internal/branding"
	"github.com/subashkarki/phantom-os-v2/internal/db"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// StrategyUsage represents how often a strategy was used and its average confidence.
type StrategyUsage struct {
	Name          string  `json:"name"`
	Count         int     `json:"count"`
	AvgConfidence float64 `json:"avg_confidence"`
}

// KnowledgeGrowth represents new knowledge recorded for a date.
type KnowledgeGrowth struct {
	DecisionsRecorded int `json:"decisions_recorded"`
	PatternsDiscovered int `json:"patterns_discovered"`
}

// GraphCoverage represents the overall graph index state.
type GraphCoverage struct {
	TotalFiles int `json:"total_files"`
	TotalEdges int `json:"total_edges"`
	Projects   int `json:"projects"`
}

// HighImpactChange represents a file change with a large blast radius.
type HighImpactChange struct {
	File        string `json:"file"`
	BlastRadius int    `json:"blast_radius"`
}

// HunterDailyStats represents gamification stat gains for a date.
type HunterDailyStats struct {
	IntGained    int    `json:"int_gained"`
	StrGained    int    `json:"str_gained"`
	AgiGained    int    `json:"agi_gained"`
	XpEarned     int    `json:"xp_earned"`
	RankProgress string `json:"rank_progress"`
}

// AIDigestData is the aggregated AI engine data for a journal entry.
type AIDigestData struct {
	Strategies        []StrategyUsage  `json:"strategies"`
	KnowledgeGrowth   KnowledgeGrowth  `json:"knowledge_growth"`
	GraphCoverage     GraphCoverage    `json:"graph_coverage"`
	HighImpactChanges []HighImpactChange `json:"high_impact_changes"`
	FailuresAvoided   int              `json:"failures_avoided"`
	HunterStats       HunterDailyStats `json:"hunter_stats"`
}

// AIDigestGatherer queries AI engine data for journal generation.
type AIDigestGatherer struct {
	queries *db.Queries
	rawDB   db.DBTX
}

// NewAIDigestGatherer creates a gatherer backed by the main DB.
func NewAIDigestGatherer(q *db.Queries, rawDB db.DBTX) *AIDigestGatherer {
	return &AIDigestGatherer{queries: q, rawDB: rawDB}
}

// ---------------------------------------------------------------------------
// Main Gather Method
// ---------------------------------------------------------------------------

// GatherAIDigestData aggregates all AI engine data for a given date (YYYY-MM-DD).
func (g *AIDigestGatherer) GatherAIDigestData(ctx context.Context, date string) AIDigestData {
	result := AIDigestData{
		Strategies:        []StrategyUsage{},
		HighImpactChanges: []HighImpactChange{},
	}

	// Strategy usage from per-project KnowledgeDB files
	strategies, decisions, highImpact, failuresAvoided := g.gatherStrategyUsage(date)
	result.Strategies = strategies
	result.KnowledgeGrowth.DecisionsRecorded = decisions
	result.HighImpactChanges = highImpact
	result.FailuresAvoided = failuresAvoided

	// Graph coverage from main DB (graph_meta table)
	result.GraphCoverage = g.gatherGraphCoverage(ctx)

	// Hunter stats from activity_log
	result.HunterStats = g.gatherHunterDailyStats(ctx, date)

	return result
}

// ---------------------------------------------------------------------------
// Strategy Usage (from per-project KnowledgeDB SQLite files)
// ---------------------------------------------------------------------------

func (g *AIDigestGatherer) gatherStrategyUsage(date string) ([]StrategyUsage, int, []HighImpactChange, int) {
	aiDir := aiEngineDir()
	entries, err := os.ReadDir(aiDir)
	if err != nil {
		return []StrategyUsage{}, 0, []HighImpactChange{}, 0
	}

	start, end := dateBoundariesMs(date)

	type stratAccum struct {
		count           int
		totalConfidence float64
	}
	stratMap := make(map[string]*stratAccum)
	totalDecisions := 0
	var highImpact []HighImpactChange
	failuresAvoided := 0

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".db") {
			continue
		}

		dbPath := filepath.Join(aiDir, entry.Name())
		kdb, err := sql.Open("sqlite", dbPath+"?mode=ro")
		if err != nil {
			continue
		}

		// Query decisions for this date
		rows, err := kdb.Query(`
			SELECT d.strategy_name, d.confidence, d.files_involved,
			       o.success, o.failure_reason
			FROM decisions d
			LEFT JOIN outcomes o ON o.decision_id = d.id
			WHERE d.created_at >= ? AND d.created_at < ?
			ORDER BY d.created_at DESC
		`, start, end)
		if err != nil {
			kdb.Close()
			continue
		}

		for rows.Next() {
			var stratName string
			var confidence float64
			var filesInvolved sql.NullString
			var success sql.NullInt64
			var failureReason sql.NullString

			if err := rows.Scan(&stratName, &confidence, &filesInvolved, &success, &failureReason); err != nil {
				continue
			}

			totalDecisions++

			acc, ok := stratMap[stratName]
			if !ok {
				acc = &stratAccum{}
				stratMap[stratName] = acc
			}
			acc.count++
			acc.totalConfidence += confidence

			// High blast radius
			if filesInvolved.Valid && filesInvolved.String != "" {
				// Count commas + 1 as a rough file count (JSON array)
				fileCount := strings.Count(filesInvolved.String, ",") + 1
				if fileCount >= 10 {
					// Extract first file from JSON array
					firstFile := extractFirstFromJSONArray(filesInvolved.String)
					if firstFile != "" {
						highImpact = append(highImpact, HighImpactChange{File: firstFile, BlastRadius: fileCount})
					}
				}
			}

			// Failures avoided (success after prior failure)
			if success.Valid && success.Int64 == 1 && failureReason.Valid && failureReason.String != "" {
				failuresAvoided++
			}
		}
		rows.Close()
		kdb.Close()
	}

	// Convert map to sorted slice
	strategies := make([]StrategyUsage, 0, len(stratMap))
	for name, acc := range stratMap {
		avg := 0.0
		if acc.count > 0 {
			avg = math.Round(acc.totalConfidence/float64(acc.count)*100) / 100
		}
		strategies = append(strategies, StrategyUsage{
			Name:          name,
			Count:         acc.count,
			AvgConfidence: avg,
		})
	}
	sort.Slice(strategies, func(i, j int) bool {
		return strategies[i].Count > strategies[j].Count
	})

	// Sort and limit high impact
	sort.Slice(highImpact, func(i, j int) bool {
		return highImpact[i].BlastRadius > highImpact[j].BlastRadius
	})
	if len(highImpact) > 5 {
		highImpact = highImpact[:5]
	}

	return strategies, totalDecisions, highImpact, failuresAvoided
}

// ---------------------------------------------------------------------------
// Graph Coverage (from main DB graph_meta table)
// ---------------------------------------------------------------------------

func (g *AIDigestGatherer) gatherGraphCoverage(ctx context.Context) GraphCoverage {
	rows, err := g.rawDB.QueryContext(ctx,
		`SELECT COALESCE(SUM(file_count), 0), COALESCE(SUM(edge_count), 0), COUNT(*)
		 FROM graph_meta`)
	if err != nil {
		return GraphCoverage{}
	}
	defer rows.Close()

	var totalFiles, totalEdges, projects int64
	if rows.Next() {
		if err := rows.Scan(&totalFiles, &totalEdges, &projects); err != nil {
			return GraphCoverage{}
		}
	}
	return GraphCoverage{
		TotalFiles: int(totalFiles),
		TotalEdges: int(totalEdges),
		Projects:   int(projects),
	}
}

// ---------------------------------------------------------------------------
// Hunter Stats (gamification delta for the date)
// ---------------------------------------------------------------------------

func (g *AIDigestGatherer) gatherHunterDailyStats(ctx context.Context, date string) HunterDailyStats {
	start, end := dateBoundariesMs(date)

	// Sum XP and count activity types for the date
	rows, err := g.rawDB.QueryContext(ctx,
		`SELECT type, COALESCE(SUM(xp_earned), 0)
		 FROM activity_log
		 WHERE timestamp >= ? AND timestamp < ?
		 GROUP BY type`,
		start, end)
	if err != nil {
		return HunterDailyStats{}
	}
	defer rows.Close()

	var intGained, strGained, agiGained, xpEarned int
	for rows.Next() {
		var actType string
		var xp int64
		if err := rows.Scan(&actType, &xp); err != nil {
			continue
		}
		xpEarned += int(xp)
		switch actType {
		case "SESSION_START", "FIRST_SESSION_OF_DAY":
			intGained++
		case "TASK_COMPLETE":
			strGained++
		case "SPEED_TASK":
			agiGained++
		}
	}

	// Rank progress
	rankProgress := ""
	var xp, xpToNext sql.NullInt64
	var rank sql.NullString
	err = g.rawDB.QueryRowContext(ctx,
		`SELECT xp, xp_to_next, rank FROM hunter_profile WHERE id = 1`).
		Scan(&xp, &xpToNext, &rank)
	if err == nil && xpToNext.Valid && xpToNext.Int64 > 0 {
		pct := int(float64(xp.Int64) / float64(xpToNext.Int64) * 100)
		r := "E"
		if rank.Valid {
			r = rank.String
		}
		rankProgress = fmt.Sprintf("%d%% to next level (%s-rank)", pct, r)
	}

	return HunterDailyStats{
		IntGained:    intGained,
		StrGained:    strGained,
		AgiGained:    agiGained,
		XpEarned:     xpEarned,
		RankProgress: rankProgress,
	}
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

// FormatAIDigestSection renders the AI Engine Insights section as markdown lines.
// Returns empty string if there's no AI activity.
func FormatAIDigestSection(data AIDigestData) string {
	hasActivity := len(data.Strategies) > 0 ||
		data.KnowledgeGrowth.DecisionsRecorded > 0 ||
		data.GraphCoverage.TotalFiles > 0

	if !hasActivity {
		return ""
	}

	var lines []string
	lines = append(lines, "AI Engine Insights:")

	// Strategy usage
	if len(data.Strategies) > 0 {
		var parts []string
		for _, s := range data.Strategies {
			parts = append(parts, fmt.Sprintf("%s (%dx, avg %d%% confidence)",
				s.Name, s.Count, int(s.AvgConfidence*100)))
		}
		lines = append(lines, fmt.Sprintf("- Strategies Used: %s", strings.Join(parts, ", ")))
	}

	// Knowledge growth
	if data.KnowledgeGrowth.DecisionsRecorded > 0 || data.KnowledgeGrowth.PatternsDiscovered > 0 {
		var parts []string
		if data.KnowledgeGrowth.DecisionsRecorded > 0 {
			parts = append(parts, fmt.Sprintf("%d new decisions recorded", data.KnowledgeGrowth.DecisionsRecorded))
		}
		if data.KnowledgeGrowth.PatternsDiscovered > 0 {
			parts = append(parts, fmt.Sprintf("%d patterns discovered", data.KnowledgeGrowth.PatternsDiscovered))
		}
		lines = append(lines, fmt.Sprintf("- Knowledge Growth: %s", strings.Join(parts, ", ")))
	}

	// High-impact changes
	for _, change := range data.HighImpactChanges {
		lines = append(lines, fmt.Sprintf("- High-Impact Change: %s (blast radius: %d files)", change.File, change.BlastRadius))
	}

	// Failures avoided
	if data.FailuresAvoided > 0 {
		lines = append(lines, fmt.Sprintf("- Mistakes Avoided: %d past failures prevented by anti-repetition system", data.FailuresAvoided))
	}

	// Graph coverage
	if data.GraphCoverage.TotalFiles > 0 {
		pSuffix := "s"
		if data.GraphCoverage.Projects == 1 {
			pSuffix = ""
		}
		lines = append(lines, fmt.Sprintf("- Graph Coverage: %d files indexed across %d project%s, %d edges",
			data.GraphCoverage.TotalFiles, data.GraphCoverage.Projects, pSuffix, data.GraphCoverage.TotalEdges))
	}

	return strings.Join(lines, "\n")
}

// FormatHunterDigestSection renders the Hunter Progress section.
// Returns empty string if no XP was earned.
func FormatHunterDigestSection(data AIDigestData) string {
	hs := data.HunterStats
	if hs.XpEarned == 0 && hs.IntGained == 0 && hs.StrGained == 0 && hs.AgiGained == 0 {
		return ""
	}

	var lines []string
	lines = append(lines, "Hunter Progress:")

	var statParts []string
	if hs.IntGained > 0 {
		statParts = append(statParts, fmt.Sprintf("INT +%d", hs.IntGained))
	}
	if hs.StrGained > 0 {
		statParts = append(statParts, fmt.Sprintf("STR +%d", hs.StrGained))
	}
	if hs.AgiGained > 0 {
		statParts = append(statParts, fmt.Sprintf("AGI +%d", hs.AgiGained))
	}
	if len(statParts) > 0 {
		lines = append(lines, fmt.Sprintf("- %s", strings.Join(statParts, " | ")))
	}

	if hs.XpEarned > 0 {
		xpLine := fmt.Sprintf("- XP earned: %d", hs.XpEarned)
		if hs.RankProgress != "" {
			xpLine += " | " + hs.RankProgress
		}
		lines = append(lines, xpLine)
	}

	return strings.Join(lines, "\n")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func aiEngineDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, branding.ConfigDirName, "ai-engine")
}

func dateBoundariesMs(date string) (int64, int64) {
	// Parse YYYY-MM-DD and return epoch milliseconds for start/end of day
	t, err := parseDate(date)
	if err != nil {
		return 0, 0
	}
	start := t.UnixMilli()
	end := start + 86_400_000
	return start, end
}

func parseDate(date string) (time.Time, error) {
	return time.ParseInLocation("2006-01-02", date, time.Local)
}

func extractFirstFromJSONArray(raw string) string {
	// Quick extraction: find first quoted string in ["foo","bar",...]
	raw = strings.TrimSpace(raw)
	if len(raw) < 4 || raw[0] != '[' {
		return ""
	}
	start := strings.Index(raw, `"`)
	if start == -1 {
		return ""
	}
	end := strings.Index(raw[start+1:], `"`)
	if end == -1 {
		return ""
	}
	return raw[start+1 : start+1+end]
}
