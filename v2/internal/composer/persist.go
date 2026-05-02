// Author: Subash Karki
//
// Package composer — DB persistence for Turn + Edit rows.
// Uses raw SQL against the writer pool; sqlc generation is left for v1
// when query patterns stabilise.
package composer

import (
	"context"
	"database/sql"
)

func (s *Service) insertTurn(ctx context.Context, t *Turn) error {
	const q = `INSERT INTO composer_turns
		(id, pane_id, session_id, cwd, prompt, model, status, started_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := s.writer.ExecContext(ctx, q,
		t.ID, t.PaneID, t.SessionID, t.CWD, t.Prompt, t.Model, t.Status, t.StartedAt,
	)
	return err
}

func (s *Service) markTurnStatus(ctx context.Context, id, status string, in, out int64, cost float64) {
	const q = `UPDATE composer_turns
		SET status = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?, completed_at = strftime('%s','now')
		WHERE id = ?`
	_, _ = s.writer.ExecContext(ctx, q, status, in, out, cost, id)
}

// markTurnDone is markTurnStatus + a flush of the assistant's accumulated
// streamed response_text. Use at end of run() so re-opened sessions can show
// the full conversation. Empty responseText is tolerated (e.g. cancelled
// before any delta arrived).
func (s *Service) markTurnDone(ctx context.Context, id, status string, in, out int64, cost float64, responseText string) {
	const q = `UPDATE composer_turns
		SET status = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?,
		    response_text = ?, completed_at = strftime('%s','now')
		WHERE id = ?`
	_, _ = s.writer.ExecContext(ctx, q, status, in, out, cost, responseText, id)
}

func (s *Service) markTurnError(ctx context.Context, id string) {
	s.markTurnStatus(ctx, id, "error", 0, 0, 0)
}

// insertEvent persists a single streaming event for later replay.
// Best-effort — errors are logged but don't interrupt the stream.
func (s *Service) insertEvent(ctx context.Context, e *EventRecord) error {
	const q = `INSERT INTO composer_events
		(turn_id, session_id, seq, type, subtype, tool_name, tool_use_id, content, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := s.writer.ExecContext(ctx, q,
		e.TurnID, e.SessionID, e.Seq, e.Type, e.Subtype, e.ToolName, e.ToolUseID, e.Content, e.CreatedAt,
	)
	return err
}

// queryEventsForTurn returns all persisted events for a turn in sequence order.
func (s *Service) queryEventsForTurn(ctx context.Context, turnID string) ([]EventRecord, error) {
	const q = `SELECT id, turn_id, session_id, seq, type, subtype,
		COALESCE(tool_name, ''), COALESCE(tool_use_id, ''), COALESCE(content, ''), created_at
		FROM composer_events WHERE turn_id = ? ORDER BY seq ASC`
	rows, err := s.writer.QueryContext(ctx, q, turnID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EventRecord
	for rows.Next() {
		var e EventRecord
		if err := rows.Scan(&e.ID, &e.TurnID, &e.SessionID, &e.Seq, &e.Type, &e.Subtype,
			&e.ToolName, &e.ToolUseID, &e.Content, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// deleteSession hard-deletes every event + edit + turn for a session in a
// single transaction. Events and edits must go first because the FK has
// ON DELETE CASCADE on turn_id but we don't rely on it (foreign_keys pragma
// is on, but explicit is safer and survives PRAGMA flips). Returns
// sql.ErrNoRows-style nil on missing session — caller treats "delete nothing"
// as success.
func (s *Service) deleteSession(ctx context.Context, sessionID string) error {
	tx, err := s.writer.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM composer_events WHERE turn_id IN (SELECT id FROM composer_turns WHERE session_id = ?)`,
		sessionID,
	); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM composer_edits WHERE turn_id IN (SELECT id FROM composer_turns WHERE session_id = ?)`,
		sessionID,
	); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM composer_turns WHERE session_id = ?`,
		sessionID,
	); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) insertEdit(ctx context.Context, e *Edit) error {
	const q = `INSERT INTO composer_edits
		(id, turn_id, pane_id, path, old_content, new_content, lines_added, lines_removed, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := s.writer.ExecContext(ctx, q,
		e.ID, e.TurnID, e.PaneID, e.Path, e.OldContent, e.NewContent,
		e.LinesAdded, e.LinesRemoved, string(e.Status), e.CreatedAt,
	)
	return err
}

func (s *Service) updateEditStatus(ctx context.Context, id string, status EditStatus, decidedAt int64) error {
	const q = `UPDATE composer_edits SET status = ?, decided_at = ? WHERE id = ?`
	_, err := s.writer.ExecContext(ctx, q, string(status), decidedAt, id)
	return err
}

func (s *Service) getEdit(ctx context.Context, id string) (*Edit, error) {
	const q = `SELECT id, turn_id, pane_id, path,
		COALESCE(old_content, ''), COALESCE(new_content, ''),
		lines_added, lines_removed, status, created_at, COALESCE(decided_at, 0)
		FROM composer_edits WHERE id = ?`
	row := s.writer.QueryRowContext(ctx, q, id)
	var e Edit
	var status string
	if err := row.Scan(&e.ID, &e.TurnID, &e.PaneID, &e.Path, &e.OldContent, &e.NewContent,
		&e.LinesAdded, &e.LinesRemoved, &status, &e.CreatedAt, &e.DecidedAt); err != nil {
		return nil, err
	}
	e.Status = EditStatus(status)
	return &e, nil
}

func (s *Service) queryPendingEdits(ctx context.Context, paneID string) ([]Edit, error) {
	const q = `SELECT id, turn_id, pane_id, path,
		COALESCE(old_content, ''), COALESCE(new_content, ''),
		lines_added, lines_removed, status, created_at, COALESCE(decided_at, 0)
		FROM composer_edits WHERE pane_id = ? AND status = 'pending'
		ORDER BY created_at ASC`
	rows, err := s.writer.QueryContext(ctx, q, paneID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Edit
	for rows.Next() {
		var e Edit
		var status string
		if err := rows.Scan(&e.ID, &e.TurnID, &e.PaneID, &e.Path, &e.OldContent, &e.NewContent,
			&e.LinesAdded, &e.LinesRemoved, &status, &e.CreatedAt, &e.DecidedAt); err != nil {
			return nil, err
		}
		e.Status = EditStatus(status)
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// queryTurnsForPane returns all turns for a pane in chronological order,
// with the edits attached to each turn. Used to rehydrate Composer history
// when a pane mounts (so users see previous turns instead of a blank slate).
func (s *Service) queryTurnsForPane(ctx context.Context, paneID string) ([]Turn, error) {
	const q = `SELECT id, pane_id, session_id, cwd, prompt, model, status,
		COALESCE(input_tokens, 0), COALESCE(output_tokens, 0), COALESCE(cost_usd, 0),
		started_at, COALESCE(completed_at, 0), COALESCE(response_text, '')
		FROM composer_turns WHERE pane_id = ? ORDER BY started_at ASC`
	rows, err := s.writer.QueryContext(ctx, q, paneID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Turn
	for rows.Next() {
		var t Turn
		if err := rows.Scan(&t.ID, &t.PaneID, &t.SessionID, &t.CWD, &t.Prompt, &t.Model,
			&t.Status, &t.InputTokens, &t.OutputTokens, &t.CostUSD,
			&t.StartedAt, &t.CompletedAt, &t.ResponseText); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// queryTurnsForSession returns all turns for a single claude session in
// chronological order. Used by HistoryBySession-rehydration so re-opening
// a past session shows every prompt the user sent across any pane.
func (s *Service) queryTurnsForSession(ctx context.Context, sessionID string) ([]Turn, error) {
	const q = `SELECT id, pane_id, session_id, cwd, prompt, model, status,
		COALESCE(input_tokens, 0), COALESCE(output_tokens, 0), COALESCE(cost_usd, 0),
		started_at, COALESCE(completed_at, 0), COALESCE(response_text, '')
		FROM composer_turns WHERE session_id = ? ORDER BY started_at ASC`
	rows, err := s.writer.QueryContext(ctx, q, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Turn
	for rows.Next() {
		var t Turn
		if err := rows.Scan(&t.ID, &t.PaneID, &t.SessionID, &t.CWD, &t.Prompt, &t.Model,
			&t.Status, &t.InputTokens, &t.OutputTokens, &t.CostUSD,
			&t.StartedAt, &t.CompletedAt, &t.ResponseText); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// querySessionSummaries returns the most recent N claude sessions, grouped
// by session_id. Each row is the most-recent activity per session plus an
// aggregate of turn count + total cost. The first prompt + first non-empty
// cwd come from the chronologically-earliest turn in the session.
func (s *Service) querySessionSummaries(ctx context.Context, limit int) ([]SessionSummary, error) {
	if limit <= 0 {
		limit = 50
	}
	// Strategy:
	//   agg:    per-session aggregates (turn count, last activity, cost sum)
	//   firsts: per-session "earliest started_at" — used to pick the first
	//           prompt + first pane_id.
	// Cwd: separate scalar subquery picks the first NON-EMPTY cwd so a
	// session that began with empty cwd (e.g. from a no-context turn) still
	// shows the worktree path once one is recorded.
	const q = `
		WITH agg AS (
			SELECT session_id,
				COUNT(*)                AS turn_count,
				MAX(started_at)         AS last_activity,
				COALESCE(SUM(cost_usd), 0) AS total_cost,
				MIN(started_at)         AS first_started_at
			FROM composer_turns
			WHERE session_id IS NOT NULL AND session_id != ''
			GROUP BY session_id
		),
		firsts AS (
			SELECT t.session_id, t.pane_id, t.prompt
			FROM composer_turns t
			INNER JOIN agg a
				ON a.session_id = t.session_id
				AND a.first_started_at = t.started_at
		)
		SELECT a.session_id,
			COALESCE(s.name, ''),
			COALESCE(f.pane_id, ''),
			COALESCE(f.prompt, ''),
			a.turn_count,
			a.last_activity,
			a.total_cost,
			COALESCE(
				(SELECT cwd FROM composer_turns
					WHERE session_id = a.session_id AND cwd IS NOT NULL AND cwd != ''
					ORDER BY started_at ASC LIMIT 1),
				''
			) AS cwd
		FROM agg a
		LEFT JOIN firsts f ON f.session_id = a.session_id
		LEFT JOIN sessions s ON s.id = a.session_id
		ORDER BY a.last_activity DESC
		LIMIT ?
	`
	rows, err := s.writer.QueryContext(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]SessionSummary, 0)
	for rows.Next() {
		var s SessionSummary
		if err := rows.Scan(&s.SessionID, &s.Name, &s.FirstPaneID, &s.FirstPrompt,
			&s.TurnCount, &s.LastActivity, &s.TotalCost, &s.Cwd); err != nil {
			return nil, err
		}
		// Truncate prompt to 200 bytes to keep the JSON payload bounded.
		// We slice on a rune boundary to avoid splitting a multi-byte char.
		if len(s.FirstPrompt) > 200 {
			runes := []rune(s.FirstPrompt)
			if len(runes) > 200 {
				s.FirstPrompt = string(runes[:200])
			}
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// queryEditsForTurn returns all edits for a turn, regardless of status.
func (s *Service) queryEditsForTurn(ctx context.Context, turnID string) ([]Edit, error) {
	const q = `SELECT id, turn_id, pane_id, path,
		COALESCE(old_content, ''), COALESCE(new_content, ''),
		lines_added, lines_removed, status, created_at, COALESCE(decided_at, 0)
		FROM composer_edits WHERE turn_id = ? ORDER BY created_at ASC`
	rows, err := s.writer.QueryContext(ctx, q, turnID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Edit
	for rows.Next() {
		var e Edit
		var status string
		if err := rows.Scan(&e.ID, &e.TurnID, &e.PaneID, &e.Path, &e.OldContent, &e.NewContent,
			&e.LinesAdded, &e.LinesRemoved, &status, &e.CreatedAt, &e.DecidedAt); err != nil {
			return nil, err
		}
		e.Status = EditStatus(status)
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// ensureSessionRow inserts a row into the `sessions` table for the given
// session ID so the "Past Sessions" sidebar can join against it immediately
// (before the session watcher picks up the JSONL file). Uses INSERT OR IGNORE
// so it's idempotent — if the session watcher already created the row, this
// is a harmless no-op.
func (s *Service) ensureSessionRow(ctx context.Context, sessionID, name, cwd, model, prompt string) error {
	const q = `INSERT OR IGNORE INTO sessions
		(id, name, cwd, kind, model, first_prompt, started_at, status, provider)
		VALUES (?, ?, ?, 'composer', ?, ?, strftime('%s','now'), 'active', 'composer')`
	truncatedPrompt := prompt
	if len(truncatedPrompt) > 200 {
		runes := []rune(truncatedPrompt)
		if len(runes) > 200 {
			truncatedPrompt = string(runes[:200])
		}
	}
	_, err := s.writer.ExecContext(ctx, q, sessionID, name, cwd, model, truncatedPrompt)
	return err
}

// queryExistingSessionNames returns a set of all session names currently in use,
// used to avoid collisions when generating a new Pokémon name.
func (s *Service) queryExistingSessionNames(ctx context.Context) map[string]bool {
	const q = `SELECT COALESCE(name, '') FROM sessions WHERE name IS NOT NULL AND name != ''`
	rows, err := s.writer.QueryContext(ctx, q)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := make(map[string]bool)
	for rows.Next() {
		var n string
		if rows.Scan(&n) == nil && n != "" {
			out[n] = true
		}
	}
	return out
}

// Compile-time guard: ensure sql.DB pointer compiles.
var _ = (*sql.DB)(nil)
