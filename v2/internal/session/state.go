// state.go tracks the lifecycle state of each session (active, paused, branched, etc.).
// Author: Subash Karki
package session

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"
)

// State represents the lifecycle phase of a session.
type State string

const (
	StateActive   State = "active"
	StatePaused   State = "paused"
	StateResumed  State = "resumed"
	StateBranched State = "branched"
	StateRewound  State = "rewound"
	StateComplete State = "complete"
)

const sqlCreateSessionState = `
CREATE TABLE IF NOT EXISTS session_state (
  session_id    TEXT    PRIMARY KEY,
  state         TEXT    NOT NULL DEFAULT 'active',
  policy        TEXT    NOT NULL DEFAULT 'supervised',
  paused_at     INTEGER,
  resumed_at    INTEGER,
  branch_parent TEXT,
  branch_point  INTEGER,
  event_count   INTEGER DEFAULT 0,
  updated_at    INTEGER NOT NULL
)`

const (
	sqlLoadAllStates = `SELECT session_id, state, policy, paused_at, resumed_at, branch_parent, branch_point, event_count FROM session_state`
	sqlUpsertState   = `INSERT INTO session_state (session_id, state, policy, paused_at, resumed_at, branch_parent, branch_point, event_count, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(session_id) DO UPDATE SET
	  state         = excluded.state,
	  policy        = excluded.policy,
	  paused_at     = excluded.paused_at,
	  resumed_at    = excluded.resumed_at,
	  branch_parent = excluded.branch_parent,
	  branch_point  = excluded.branch_point,
	  event_count   = excluded.event_count,
	  updated_at    = excluded.updated_at`
)

// SessionState is the full state snapshot for a single session.
type SessionState struct {
	SessionID    string `json:"session_id"`
	State        State  `json:"state"`
	Policy       Policy `json:"policy"`
	PausedAt     int64  `json:"paused_at,omitempty"`
	ResumedAt    int64  `json:"resumed_at,omitempty"`
	BranchParent string `json:"branch_parent,omitempty"`
	BranchPoint  int    `json:"branch_point,omitempty"`
	EventCount   int    `json:"event_count"`
}

// StateManager maintains an in-memory cache of SessionState objects backed by SQLite.
type StateManager struct {
	states sync.Map // sessionID -> *SessionState
	db     *sql.DB
}

// NewStateManager creates a StateManager backed by the writer DB connection.
func NewStateManager(writer *sql.DB) *StateManager {
	return &StateManager{db: writer}
}

// Init creates the session_state table if it does not already exist.
func (sm *StateManager) Init(ctx context.Context) error {
	if _, err := sm.db.ExecContext(ctx, sqlCreateSessionState); err != nil {
		return fmt.Errorf("session/state: init table: %w", err)
	}
	return nil
}

// Get returns the current in-memory state for a session, or nil if unknown.
func (sm *StateManager) Get(sessionID string) *SessionState {
	if v, ok := sm.states.Load(sessionID); ok {
		return v.(*SessionState)
	}
	return nil
}

// SetState transitions a session to the given state, persisting immediately.
// It always works on a local copy of the SessionState to avoid data races when
// multiple goroutines call SetState for the same session ID concurrently.
func (sm *StateManager) SetState(ctx context.Context, sessionID string, state State) error {
	now := time.Now().Unix()

	// Build a local copy — never mutate the pointer stored in the sync.Map in
	// place, because another goroutine may be reading or writing it concurrently.
	var local SessionState
	if v, ok := sm.states.Load(sessionID); ok {
		local = *v.(*SessionState) // copy all fields
	} else {
		local = SessionState{SessionID: sessionID, Policy: PolicySupervised}
	}

	local.State = state
	switch state {
	case StatePaused:
		local.PausedAt = now
	case StateActive, StateResumed:
		local.ResumedAt = now
	}

	// Store a fresh pointer so the old pointer's readers are unaffected.
	ss := local
	sm.states.Store(sessionID, &ss)

	_, err := sm.db.ExecContext(ctx, sqlUpsertState,
		ss.SessionID,
		string(ss.State),
		string(ss.Policy),
		nullInt64(ss.PausedAt),
		nullInt64(ss.ResumedAt),
		nullString(ss.BranchParent),
		nullInt(ss.BranchPoint),
		ss.EventCount,
		now,
	)
	if err != nil {
		return fmt.Errorf("session/state: set state %s -> %s: %w", sessionID, state, err)
	}
	return nil
}

// LoadFromDB populates the in-memory cache from all rows in session_state.
func (sm *StateManager) LoadFromDB(ctx context.Context) error {
	rows, err := sm.db.QueryContext(ctx, sqlLoadAllStates)
	if err != nil {
		return fmt.Errorf("session/state: load from db: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			ss           SessionState
			pausedAt     sql.NullInt64
			resumedAt    sql.NullInt64
			branchParent sql.NullString
			branchPoint  sql.NullInt64
		)
		if err := rows.Scan(
			&ss.SessionID, &ss.State, &ss.Policy,
			&pausedAt, &resumedAt, &branchParent, &branchPoint,
			&ss.EventCount,
		); err != nil {
			return fmt.Errorf("session/state: scan row: %w", err)
		}
		if pausedAt.Valid {
			ss.PausedAt = pausedAt.Int64
		}
		if resumedAt.Valid {
			ss.ResumedAt = resumedAt.Int64
		}
		if branchParent.Valid {
			ss.BranchParent = branchParent.String
		}
		if branchPoint.Valid {
			ss.BranchPoint = int(branchPoint.Int64)
		}
		local := ss
		sm.states.Store(ss.SessionID, &local)
	}
	return rows.Err()
}

// persist writes an existing SessionState to the DB (used by Controller for branch/rewind).
func (sm *StateManager) persist(ctx context.Context, ss *SessionState) error {
	now := time.Now().Unix()
	_, err := sm.db.ExecContext(ctx, sqlUpsertState,
		ss.SessionID,
		string(ss.State),
		string(ss.Policy),
		nullInt64(ss.PausedAt),
		nullInt64(ss.ResumedAt),
		nullString(ss.BranchParent),
		nullInt(ss.BranchPoint),
		ss.EventCount,
		now,
	)
	if err != nil {
		return fmt.Errorf("session/state: persist %s: %w", ss.SessionID, err)
	}
	return nil
}

// -- sql.Null helpers --------------------------------------------------------

func nullInt64(v int64) sql.NullInt64 {
	return sql.NullInt64{Int64: v, Valid: v != 0}
}

func nullString(v string) sql.NullString {
	return sql.NullString{String: v, Valid: v != ""}
}

func nullInt(v int) sql.NullInt64 {
	return sql.NullInt64{Int64: int64(v), Valid: v != 0}
}
