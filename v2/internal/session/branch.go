// branch.go records session branching relationships.
// Author: Subash Karki
package session

import (
	"context"
	"database/sql"
	"fmt"
)

const sqlCreateBranches = `
CREATE TABLE IF NOT EXISTS session_branches (
  id           TEXT    PRIMARY KEY,
  parent_id    TEXT    NOT NULL,
  branch_point INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
)`

const (
	sqlInsertBranch     = `INSERT INTO session_branches (id, parent_id, branch_point, created_at) VALUES (?, ?, ?, ?)`
	sqlListBranches     = `SELECT id, parent_id, branch_point, created_at FROM session_branches WHERE parent_id = ?`
	sqlBranchByID       = `SELECT id, parent_id, branch_point, created_at FROM session_branches WHERE id = ?`
	sqlChildrenOfParent = `SELECT id, parent_id, branch_point, created_at FROM session_branches WHERE parent_id = ?`
)

// BranchInfo describes a single branching relationship.
type BranchInfo struct {
	ID          string `json:"id"`
	ParentID    string `json:"parent_id"`
	BranchPoint int    `json:"branch_point"`
	CreatedAt   int64  `json:"created_at"`
}

// BranchStore persists and retrieves session branch records.
type BranchStore struct {
	db *sql.DB
}

// NewBranchStore creates a BranchStore backed by the writer DB connection.
func NewBranchStore(writer *sql.DB) *BranchStore {
	return &BranchStore{db: writer}
}

// Init creates the session_branches table if it does not already exist.
func (bs *BranchStore) Init(ctx context.Context) error {
	if _, err := bs.db.ExecContext(ctx, sqlCreateBranches); err != nil {
		return fmt.Errorf("session/branch: init table: %w", err)
	}
	return nil
}

// Create records a new branch.
func (bs *BranchStore) Create(ctx context.Context, branch BranchInfo) error {
	_, err := bs.db.ExecContext(ctx, sqlInsertBranch,
		branch.ID, branch.ParentID, branch.BranchPoint, branch.CreatedAt)
	if err != nil {
		return fmt.Errorf("session/branch: create %s: %w", branch.ID, err)
	}
	return nil
}

// ListForSession returns all direct branches of a session (one level only).
func (bs *BranchStore) ListForSession(ctx context.Context, sessionID string) ([]BranchInfo, error) {
	rows, err := bs.db.QueryContext(ctx, sqlListBranches, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session/branch: list for %s: %w", sessionID, err)
	}
	defer rows.Close()
	return scanBranchRows(rows)
}

// GetBranchTree returns the full ancestry tree: the session's own record (if it
// is a branch) plus all descendants, found via recursive BFS over parent_id.
func (bs *BranchStore) GetBranchTree(ctx context.Context, sessionID string) ([]BranchInfo, error) {
	seen := map[string]bool{sessionID: true}
	queue := []string{sessionID}
	var result []BranchInfo

	// Include the session's own branch record if it exists.
	var root BranchInfo
	if err := bs.db.QueryRowContext(ctx, sqlBranchByID, sessionID).
		Scan(&root.ID, &root.ParentID, &root.BranchPoint, &root.CreatedAt); err == nil {
		result = append(result, root)
	}

	for len(queue) > 0 {
		parent := queue[0]
		queue = queue[1:]

		rows, err := bs.db.QueryContext(ctx, sqlChildrenOfParent, parent)
		if err != nil {
			return nil, fmt.Errorf("session/branch: tree children of %s: %w", parent, err)
		}
		children, err := scanBranchRows(rows)
		rows.Close()
		if err != nil {
			return nil, err
		}

		for _, child := range children {
			if seen[child.ID] {
				continue
			}
			seen[child.ID] = true
			result = append(result, child)
			queue = append(queue, child.ID)
		}
	}

	return result, nil
}

func scanBranchRows(rows *sql.Rows) ([]BranchInfo, error) {
	var out []BranchInfo
	for rows.Next() {
		var b BranchInfo
		if err := rows.Scan(&b.ID, &b.ParentID, &b.BranchPoint, &b.CreatedAt); err != nil {
			return nil, fmt.Errorf("session/branch: scan: %w", err)
		}
		out = append(out, b)
	}
	return out, rows.Err()
}
