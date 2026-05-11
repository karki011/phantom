// Package strategies provides AI prompt enhancement strategies.
// PerformanceStore tracks strategy success rates per complexity tier
// so the registry can weight selection by historical performance.
//
// Author: Subash Karki
package strategies

import (
	"database/sql"
	"sync"
)

// PerformanceStore records strategy outcomes and produces historical weights.
type PerformanceStore struct {
	mu      sync.RWMutex
	records map[string]map[TaskComplexity]*perfRecord
}

// perfRecord tracks successes and total attempts for a strategy+complexity pair.
type perfRecord struct {
	successes int
	total     int
}

// NewPerformanceStore creates an empty PerformanceStore.
func NewPerformanceStore() *PerformanceStore {
	return &PerformanceStore{records: make(map[string]map[TaskComplexity]*perfRecord)}
}

// Record logs a strategy outcome for the given complexity tier.
func (ps *PerformanceStore) Record(strategyID string, complexity TaskComplexity, success bool) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	if ps.records[strategyID] == nil {
		ps.records[strategyID] = make(map[TaskComplexity]*perfRecord)
	}
	r := ps.records[strategyID][complexity]
	if r == nil {
		r = &perfRecord{}
		ps.records[strategyID][complexity] = r
	}
	r.total++
	if success {
		r.successes++
	}
}

// GetHistoricalWeight returns a multiplier for the strategy's score based
// on its success rate at the given complexity. Returns 1.0 (neutral) until
// at least 3 data points exist. Range: 0.5 to 1.5.
func (ps *PerformanceStore) GetHistoricalWeight(strategyID string, complexity TaskComplexity) float64 {
	ps.mu.RLock()
	defer ps.mu.RUnlock()

	complexityRecords := ps.records[strategyID]
	if complexityRecords == nil {
		return 1.0
	}
	r := complexityRecords[complexity]
	if r == nil || r.total < 3 {
		return 1.0
	}
	successRate := float64(r.successes) / float64(r.total)
	weight := 0.8 + (successRate * 0.4) // Range: 0.8 (0% success) to 1.2 (100% success)
	return weight
}

// Reset clears all in-memory performance records and wipes the persisted table.
func (ps *PerformanceStore) Reset(db *sql.DB) error {
	ps.mu.Lock()
	ps.records = make(map[string]map[TaskComplexity]*perfRecord)
	ps.mu.Unlock()
	if db != nil {
		_, err := db.Exec(`DELETE FROM ai_performance`)
		return err
	}
	return nil
}

// Save persists all performance records to SQLite.
func (ps *PerformanceStore) Save(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS ai_performance (
		strategy_id TEXT NOT NULL,
		complexity TEXT NOT NULL,
		successes INTEGER NOT NULL,
		total INTEGER NOT NULL,
		PRIMARY KEY(strategy_id, complexity)
	)`); err != nil {
		return err
	}

	ps.mu.RLock()
	defer ps.mu.RUnlock()

	for sid, complexityMap := range ps.records {
		for comp, r := range complexityMap {
			if _, err := db.Exec(
				`INSERT OR REPLACE INTO ai_performance (strategy_id, complexity, successes, total) VALUES (?, ?, ?, ?)`,
				sid, string(comp), r.successes, r.total,
			); err != nil {
				return err
			}
		}
	}
	return nil
}

// Load restores performance records from SQLite.
func (ps *PerformanceStore) Load(db *sql.DB) error {
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS ai_performance (
		strategy_id TEXT NOT NULL,
		complexity TEXT NOT NULL,
		successes INTEGER NOT NULL,
		total INTEGER NOT NULL,
		PRIMARY KEY(strategy_id, complexity)
	)`); err != nil {
		return err
	}
	rows, err := db.Query(`SELECT strategy_id, complexity, successes, total FROM ai_performance`)
	if err != nil {
		return err
	}
	defer rows.Close()

	ps.mu.Lock()
	defer ps.mu.Unlock()

	ps.records = make(map[string]map[TaskComplexity]*perfRecord)
	for rows.Next() {
		var sid, comp string
		var successes, total int
		if err := rows.Scan(&sid, &comp, &successes, &total); err != nil {
			return err
		}
		if ps.records[sid] == nil {
			ps.records[sid] = make(map[TaskComplexity]*perfRecord)
		}
		ps.records[sid][TaskComplexity(comp)] = &perfRecord{successes: successes, total: total}
	}
	return rows.Err()
}

// StrategyStats is a public snapshot of a strategy's performance at a
// given complexity tier. Used by TUI monitors and dashboards.
type StrategyStats struct {
	StrategyID string
	Complexity TaskComplexity
	Successes  int
	Total      int
}

// GetStats returns a snapshot of all performance records. The returned
// slice is safe to read without holding a lock.
func (ps *PerformanceStore) GetStats() []StrategyStats {
	ps.mu.RLock()
	defer ps.mu.RUnlock()
	var out []StrategyStats
	for sid, complexityMap := range ps.records {
		for comp, r := range complexityMap {
			out = append(out, StrategyStats{
				StrategyID: sid,
				Complexity: comp,
				Successes:  r.successes,
				Total:      r.total,
			})
		}
	}
	return out
}
