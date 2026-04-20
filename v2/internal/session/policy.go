// policy.go manages per-session approval policies for PhantomOS tool calls.
// Author: Subash Karki
package session

import (
	"context"
	"database/sql"
	"fmt"
)

// Policy controls how tool calls are approved within a session.
type Policy string

const (
	// PolicySupervised requires the user to confirm each tool call before execution.
	PolicySupervised Policy = "supervised"
	// PolicyAutoAccept accepts all tool calls without user confirmation.
	PolicyAutoAccept Policy = "auto"
	// PolicySmart uses ML-based approval (future); currently behaves as auto.
	PolicySmart Policy = "smart"
)

const (
	sqlGetPolicy     = `SELECT policy FROM session_policies WHERE session_id = ? LIMIT 1`
	sqlUpsertPolicy  = `INSERT INTO session_policies (session_id, policy, updated_at) VALUES (?, ?, strftime('%s','now')) ON CONFLICT(session_id) DO UPDATE SET policy = excluded.policy, updated_at = excluded.updated_at`
	sqlGetDefault    = `SELECT policy FROM session_policies WHERE session_id = '__default__' LIMIT 1`
	sqlUpsertDefault = `INSERT INTO session_policies (session_id, policy, updated_at) VALUES ('__default__', ?, strftime('%s','now')) ON CONFLICT(session_id) DO UPDATE SET policy = excluded.policy, updated_at = excluded.updated_at`
)

// PolicyStore reads and writes per-session policies from the session_policies table.
type PolicyStore struct {
	db *sql.DB
}

// NewPolicyStore creates a PolicyStore backed by the writer DB connection.
func NewPolicyStore(writer *sql.DB) *PolicyStore {
	return &PolicyStore{db: writer}
}

// Get returns the policy for a session. Defaults to PolicySupervised if not set.
func (ps *PolicyStore) Get(ctx context.Context, sessionID string) (Policy, error) {
	var p string
	err := ps.db.QueryRowContext(ctx, sqlGetPolicy, sessionID).Scan(&p)
	if err == sql.ErrNoRows {
		return PolicySupervised, nil
	}
	if err != nil {
		return PolicySupervised, fmt.Errorf("session/policy: get %s: %w", sessionID, err)
	}
	return Policy(p), nil
}

// Set updates the policy for a session, persisting immediately.
func (ps *PolicyStore) Set(ctx context.Context, sessionID string, policy Policy) error {
	if _, err := ps.db.ExecContext(ctx, sqlUpsertPolicy, sessionID, string(policy)); err != nil {
		return fmt.Errorf("session/policy: set %s: %w", sessionID, err)
	}
	return nil
}

// SetDefault sets the default policy applied to newly created sessions.
func (ps *PolicyStore) SetDefault(ctx context.Context, policy Policy) error {
	if _, err := ps.db.ExecContext(ctx, sqlUpsertDefault, string(policy)); err != nil {
		return fmt.Errorf("session/policy: set default: %w", err)
	}
	return nil
}

// GetDefault returns the default policy. Falls back to PolicySupervised on any error.
func (ps *PolicyStore) GetDefault(ctx context.Context) Policy {
	var p string
	err := ps.db.QueryRowContext(ctx, sqlGetDefault).Scan(&p)
	if err != nil {
		return PolicySupervised
	}
	return Policy(p)
}
