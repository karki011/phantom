// audit.go implements the ward audit trail persistence layer.
// Author: Subash Karki
package safety

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// AuditStore persists rule evaluation results to SQLite.
type AuditStore struct {
	db *sql.DB
}

// NewAuditStore creates an AuditStore backed by the provided *sql.DB writer.
func NewAuditStore(writer *sql.DB) *AuditStore {
	return &AuditStore{db: writer}
}

// Init creates the ward_audit table if it doesn't exist.
func (a *AuditStore) Init(ctx context.Context) error {
	const ddl = `
CREATE TABLE IF NOT EXISTS ward_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id    TEXT    NOT NULL,
  rule_name  TEXT    NOT NULL,
  level      TEXT    NOT NULL,
  session_id TEXT,
  event_seq  INTEGER,
  tool_name  TEXT,
  tool_input TEXT,
  outcome    TEXT    NOT NULL,
  message    TEXT,
  timestamp  INTEGER NOT NULL
)`
	_, err := a.db.ExecContext(ctx, ddl)
	return err
}

// Record persists a single Evaluation to the audit table.
func (a *AuditStore) Record(ctx context.Context, eval Evaluation) error {
	const q = `
INSERT INTO ward_audit
  (rule_id, rule_name, level, session_id, event_seq, tool_name, tool_input, outcome, message, timestamp)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := a.db.ExecContext(ctx, q,
		eval.RuleID,
		eval.RuleName,
		string(eval.Level),
		eval.SessionID,
		eval.EventSeq,
		eval.ToolName,
		eval.ToolInput,
		eval.Outcome,
		eval.Message,
		eval.Timestamp,
	)
	return err
}

// AuditQueryOpts controls filtering for Query.
type AuditQueryOpts struct {
	RuleID    string
	SessionID string
	Level     Level
	Limit     int
	Since     int64 // unix timestamp (ms)
}

// Query retrieves audit entries matching the given filters.
func (a *AuditStore) Query(ctx context.Context, opts AuditQueryOpts) ([]Evaluation, error) {
	var clauses []string
	var args []interface{}

	if opts.RuleID != "" {
		clauses = append(clauses, "rule_id = ?")
		args = append(args, opts.RuleID)
	}
	if opts.SessionID != "" {
		clauses = append(clauses, "session_id = ?")
		args = append(args, opts.SessionID)
	}
	if opts.Level != "" {
		clauses = append(clauses, "level = ?")
		args = append(args, string(opts.Level))
	}
	if opts.Since > 0 {
		clauses = append(clauses, "timestamp >= ?")
		args = append(args, opts.Since)
	}

	q := `SELECT rule_id, rule_name, level, session_id, event_seq, tool_name, tool_input, outcome, message, timestamp
FROM ward_audit`
	if len(clauses) > 0 {
		q += " WHERE " + strings.Join(clauses, " AND ")
	}
	q += " ORDER BY timestamp DESC"
	if opts.Limit > 0 {
		q += fmt.Sprintf(" LIMIT %d", opts.Limit)
	}

	rows, err := a.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Evaluation
	for rows.Next() {
		var ev Evaluation
		var level string
		if err := rows.Scan(
			&ev.RuleID,
			&ev.RuleName,
			&level,
			&ev.SessionID,
			&ev.EventSeq,
			&ev.ToolName,
			&ev.ToolInput,
			&ev.Outcome,
			&ev.Message,
			&ev.Timestamp,
		); err != nil {
			return nil, err
		}
		ev.Level = Level(level)
		ev.Matched = true
		out = append(out, ev)
	}
	return out, rows.Err()
}

// AuditStats holds aggregate statistics for ward triggers.
type AuditStats struct {
	TotalTriggers int        `json:"total_triggers"`
	TotalBypasses int        `json:"total_bypasses"`
	BypassRate    float64    `json:"bypass_rate"`
	TopRules      []RuleStat `json:"top_rules"`
}

// RuleStat is a per-rule trigger count.
type RuleStat struct {
	RuleID   string `json:"rule_id"`
	RuleName string `json:"rule_name"`
	Count    int    `json:"count"`
}

// Stats returns aggregate statistics across all audit records.
func (a *AuditStore) Stats(ctx context.Context) (*AuditStats, error) {
	var stats AuditStats

	if err := a.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ward_audit`).Scan(&stats.TotalTriggers); err != nil {
		return nil, err
	}
	if err := a.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ward_audit WHERE outcome = 'bypassed'`).Scan(&stats.TotalBypasses); err != nil {
		return nil, err
	}
	if stats.TotalTriggers > 0 {
		stats.BypassRate = float64(stats.TotalBypasses) / float64(stats.TotalTriggers)
	}

	rows, err := a.db.QueryContext(ctx, `
SELECT rule_id, rule_name, COUNT(*) AS cnt
FROM ward_audit
GROUP BY rule_id, rule_name
ORDER BY cnt DESC
LIMIT 10`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var rs RuleStat
		if err := rows.Scan(&rs.RuleID, &rs.RuleName, &rs.Count); err != nil {
			return nil, err
		}
		stats.TopRules = append(stats.TopRules, rs)
	}
	return &stats, rows.Err()
}
