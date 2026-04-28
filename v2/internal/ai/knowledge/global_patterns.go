// Package knowledge provides a unified interface for querying codebase knowledge.
// GlobalPatternStore aggregates proven patterns across multiple per-project
// databases into a single global store, enabling cross-project knowledge transfer.
//
// Author: Subash Karki
package knowledge

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// GlobalPattern represents a strategy pattern that has proven effective
// across multiple projects for a given complexity/risk combination.
type GlobalPattern struct {
	StrategyID   string
	Complexity   string
	Risk         string
	SuccessRate  float64
	ProjectCount int
	ProjectIDs   []string
	DiscoveredAt time.Time
}

// GlobalPatternStore manages the global pattern database at ~/.phantom-os/ai-engine/global.db.
type GlobalPatternStore struct {
	db      *sql.DB
	dataDir string
}

// NewGlobalPatternStore opens (or creates) the global pattern database and ensures
// the schema exists.
func NewGlobalPatternStore(dataDir string) (*GlobalPatternStore, error) {
	dbPath := filepath.Join(dataDir, "global.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS global_patterns (
			id TEXT PRIMARY KEY,
			strategy_id TEXT NOT NULL,
			complexity TEXT NOT NULL,
			risk TEXT NOT NULL,
			success_rate REAL NOT NULL,
			project_count INTEGER NOT NULL DEFAULT 1,
			project_ids TEXT NOT NULL DEFAULT '',
			discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(strategy_id, complexity, risk)
		);
	`)
	if err != nil {
		db.Close()
		return nil, err
	}

	return &GlobalPatternStore{db: db, dataDir: dataDir}, nil
}

// Close releases the underlying database connection.
func (s *GlobalPatternStore) Close() error {
	return s.db.Close()
}

// projectPattern holds a per-project pattern read from its ai_patterns table.
type projectPattern struct {
	StrategyID  string
	Complexity  string
	Risk        string
	SuccessRate float64
}

// aggregationKey groups patterns by (strategy, complexity, risk).
type aggregationKey struct {
	StrategyID string
	Complexity string
	Risk       string
}

// aggregationBucket accumulates success rates and project IDs for a key.
type aggregationBucket struct {
	totalRate  float64
	projectIDs map[string]bool
}

// Aggregate scans all per-project databases in the data directory, reads active
// patterns from their ai_patterns tables, and promotes patterns that appear in
// 3+ projects with an average success rate above 70% into the global store.
func (s *GlobalPatternStore) Aggregate() error {
	entries, err := os.ReadDir(s.dataDir)
	if err != nil {
		return err
	}

	buckets := make(map[aggregationKey]*aggregationBucket)

	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".db") || name == "global.db" {
			continue
		}

		projectID := strings.TrimSuffix(name, ".db")
		dbPath := filepath.Join(s.dataDir, name)

		patterns, err := readProjectPatterns(dbPath)
		if err != nil {
			LogError("global-patterns", "readProjectPatterns", err, dbPath)
			continue
		}

		for _, p := range patterns {
			key := aggregationKey{
				StrategyID: p.StrategyID,
				Complexity: p.Complexity,
				Risk:       p.Risk,
			}
			b, ok := buckets[key]
			if !ok {
				b = &aggregationBucket{projectIDs: make(map[string]bool)}
				buckets[key] = b
			}
			b.totalRate += p.SuccessRate
			b.projectIDs[projectID] = true
		}
	}

	// Promote patterns meeting the threshold.
	for key, bucket := range buckets {
		count := len(bucket.projectIDs)
		if count < 3 {
			continue
		}

		avgRate := bucket.totalRate / float64(count)
		if avgRate <= 0.7 {
			continue
		}

		ids := make([]string, 0, count)
		for id := range bucket.projectIDs {
			ids = append(ids, id)
		}
		projectIDsStr := strings.Join(ids, ",")
		patternID := key.StrategyID + ":" + key.Complexity + ":" + key.Risk

		_, err := s.db.Exec(`
			INSERT INTO global_patterns (id, strategy_id, complexity, risk, success_rate, project_count, project_ids)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(strategy_id, complexity, risk) DO UPDATE SET
				success_rate = excluded.success_rate,
				project_count = excluded.project_count,
				project_ids = excluded.project_ids
		`, patternID, key.StrategyID, key.Complexity, key.Risk, avgRate, count, projectIDsStr)
		if err != nil {
			return err
		}
	}

	return nil
}

// readProjectPatterns opens a per-project DB read-only and reads active patterns.
func readProjectPatterns(dbPath string) ([]projectPattern, error) {
	db, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		return nil, err
	}
	defer db.Close()

	// The ai_patterns table may not exist yet if the compactor hasn't run.
	var tableName string
	err = db.QueryRow(
		"SELECT name FROM sqlite_master WHERE type='table' AND name='ai_patterns'",
	).Scan(&tableName)
	if err != nil {
		return nil, nil // Table doesn't exist — skip.
	}

	rows, err := db.Query(
		"SELECT strategy_id, complexity, risk, success_rate FROM ai_patterns WHERE status = 'active'",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var patterns []projectPattern
	for rows.Next() {
		var p projectPattern
		if err := rows.Scan(&p.StrategyID, &p.Complexity, &p.Risk, &p.SuccessRate); err != nil {
			continue
		}
		patterns = append(patterns, p)
	}
	return patterns, rows.Err()
}

// Pattern mirrors the per-project pattern shape returned as seed suggestions.
type Pattern struct {
	StrategyID  string
	Complexity  string
	Risk        string
	SuccessRate float64
}

// SeedProject returns global patterns suitable for seeding a new project.
// Only patterns with success_rate > 0.7 and project_count >= 3 are returned.
func (s *GlobalPatternStore) SeedProject(_ string) []Pattern {
	rows, err := s.db.Query(
		"SELECT strategy_id, complexity, risk, success_rate FROM global_patterns WHERE success_rate > 0.7 AND project_count >= 3",
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var patterns []Pattern
	for rows.Next() {
		var p Pattern
		if err := rows.Scan(&p.StrategyID, &p.Complexity, &p.Risk, &p.SuccessRate); err != nil {
			continue
		}
		patterns = append(patterns, p)
	}
	return patterns
}

// GetAll returns all global patterns from the store.
func (s *GlobalPatternStore) GetAll() []GlobalPattern {
	rows, err := s.db.Query(
		"SELECT strategy_id, complexity, risk, success_rate, project_count, project_ids, discovered_at FROM global_patterns",
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var patterns []GlobalPattern
	for rows.Next() {
		var gp GlobalPattern
		var projectIDsStr string
		if err := rows.Scan(&gp.StrategyID, &gp.Complexity, &gp.Risk, &gp.SuccessRate, &gp.ProjectCount, &projectIDsStr, &gp.DiscoveredAt); err != nil {
			continue
		}
		if projectIDsStr != "" {
			gp.ProjectIDs = strings.Split(projectIDsStr, ",")
		}
		patterns = append(patterns, gp)
	}
	return patterns
}
