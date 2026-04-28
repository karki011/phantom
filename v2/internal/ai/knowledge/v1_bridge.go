// Package knowledge provides a bridge from v2 to v1's per-project knowledge databases.
//
// v1 stores AI decisions in per-project SQLite files at
// ~/.phantom-os/ai-engine/{projectId}.db using table name "decisions".
// This bridge reads those databases in read-only mode so v2 can surface
// historical v1 knowledge during strategy selection.
//
// Author: Subash Karki
package knowledge

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite" // SQLite driver
)

// V1Decision mirrors the v1 decisions table schema.
type V1Decision struct {
	ID         string
	Goal       string
	StrategyID string
	Confidence float64
	Complexity string
	Risk       string
	CreatedAt  time.Time
}

// V1Outcome mirrors the v1 outcomes table schema.
type V1Outcome struct {
	DecisionID    string
	Success       bool
	FailureReason string
}

// V1Bridge reads v1 knowledge databases in read-only mode.
type V1Bridge struct {
	dataDir string // ~/.phantom-os/ai-engine/
}

// NewV1Bridge creates a bridge pointing at the default v1 data directory.
func NewV1Bridge() *V1Bridge {
	home, _ := os.UserHomeDir()
	return &V1Bridge{dataDir: filepath.Join(home, ".phantom-os", "ai-engine")}
}

// ReadV1Decisions reads the most recent decisions from a v1 project's knowledge DB.
// Returns nil (no error) if the project DB or table doesn't exist.
func (b *V1Bridge) ReadV1Decisions(projectID string, limit int) ([]V1Decision, error) {
	dbPath := filepath.Join(b.dataDir, projectID+".db")
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		return nil, nil // No v1 data for this project
	}

	// Open read-only to avoid interfering with a running v1 instance
	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(
		"SELECT id, goal, strategy_id, confidence, complexity, risk, created_at "+
			"FROM decisions ORDER BY created_at DESC LIMIT ?",
		limit,
	)
	if err != nil {
		// Table may not exist — not an error for bridge purposes
		return nil, nil
	}
	defer rows.Close()

	var decisions []V1Decision
	for rows.Next() {
		var d V1Decision
		var createdAtMs int64
		if err := rows.Scan(&d.ID, &d.Goal, &d.StrategyID, &d.Confidence, &d.Complexity, &d.Risk, &createdAtMs); err != nil {
			continue
		}
		d.CreatedAt = time.UnixMilli(createdAtMs)
		decisions = append(decisions, d)
	}
	return decisions, nil
}

// ReadV1FailedApproaches finds strategies that failed on goals similar to the given one
// in a v1 project's knowledge DB.
func (b *V1Bridge) ReadV1FailedApproaches(projectID string, goal string) ([]FailedApproach, error) {
	dbPath := filepath.Join(b.dataDir, projectID+".db")
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		return nil, nil
	}

	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return nil, err
	}
	defer db.Close()

	// Read recent decisions
	rows, err := db.Query(
		"SELECT id, goal, strategy_id, created_at FROM decisions ORDER BY created_at DESC LIMIT 100",
	)
	if err != nil {
		return nil, nil
	}
	defer rows.Close()

	goalTokens := tokenize(goal)

	var failures []FailedApproach
	for rows.Next() {
		var id, rowGoal, strategyID string
		var createdAtMs int64
		if err := rows.Scan(&id, &rowGoal, &strategyID, &createdAtMs); err != nil {
			continue
		}

		// Check similarity
		sim := jaccardSimilarity(goalTokens, tokenize(rowGoal))
		if sim < 0.3 {
			continue
		}

		// Check if outcome was a failure — v1 uses table "outcomes"
		var success int
		err := db.QueryRow(
			"SELECT success FROM outcomes WHERE decision_id = ? LIMIT 1", id,
		).Scan(&success)
		if err == nil && success == 0 {
			failures = append(failures, FailedApproach{
				StrategyID: strategyID,
				CreatedAt:  time.UnixMilli(createdAtMs),
			})
		}
	}
	return failures, nil
}

// ListV1Projects returns project IDs that have v1 knowledge databases.
func (b *V1Bridge) ListV1Projects() ([]string, error) {
	entries, err := os.ReadDir(b.dataDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var projects []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".db") {
			id := strings.TrimSuffix(e.Name(), ".db")
			// Skip WAL/SHM sidecar files
			if !strings.HasSuffix(id, "-shm") && !strings.HasSuffix(id, "-wal") {
				projects = append(projects, id)
			}
		}
	}
	return projects, nil
}
