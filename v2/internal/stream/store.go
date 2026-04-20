// store.go persists parsed stream events to the session_events DB table.
// Author: Subash Karki
package stream

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

const (
	sqlInsertEvent = `INSERT INTO session_events (session_id, type, data, timestamp) VALUES (?, ?, ?, ?)`
	sqlSelectEvents = `SELECT id, session_id, type, data, timestamp
		FROM session_events
		WHERE session_id = ?
		ORDER BY timestamp ASC, id ASC
		LIMIT ? OFFSET ?`
	sqlCountEvents  = `SELECT COUNT(*) FROM session_events WHERE session_id = ?`
	sqlSelectAll    = `SELECT id, session_id, type, data, timestamp FROM session_events WHERE session_id = ? ORDER BY timestamp ASC, id ASC`
)

// Store persists and retrieves stream Events from the session_events table.
type Store struct {
	db *sql.DB
}

// NewStore creates a Store backed by the writer DB connection.
func NewStore(writer *sql.DB) *Store {
	return &Store{db: writer}
}

// SaveEvent persists a single event. The event is stored as JSON in the data column.
func (st *Store) SaveEvent(ctx context.Context, ev *Event) error {
	data, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("stream/store: marshal event: %w", err)
	}
	_, err = st.db.ExecContext(ctx, sqlInsertEvent, ev.SessionID, string(ev.Type), string(data), ev.Timestamp)
	if err != nil {
		return fmt.Errorf("stream/store: insert event: %w", err)
	}
	return nil
}

// SaveBatch persists multiple events in a single transaction.
func (st *Store) SaveBatch(ctx context.Context, events []Event) error {
	if len(events) == 0 {
		return nil
	}

	tx, err := st.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("stream/store: begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	stmt, err := tx.PrepareContext(ctx, sqlInsertEvent)
	if err != nil {
		return fmt.Errorf("stream/store: prepare: %w", err)
	}
	defer stmt.Close()

	for i := range events {
		ev := &events[i]
		data, err := json.Marshal(ev)
		if err != nil {
			return fmt.Errorf("stream/store: marshal event %d: %w", i, err)
		}
		if _, err = stmt.ExecContext(ctx, ev.SessionID, string(ev.Type), string(data), ev.Timestamp); err != nil {
			return fmt.Errorf("stream/store: insert event %d: %w", i, err)
		}
	}

	return tx.Commit()
}

// GetEvents retrieves events for a session with pagination (offset + limit).
func (st *Store) GetEvents(ctx context.Context, sessionID string, offset, limit int) ([]Event, error) {
	rows, err := st.db.QueryContext(ctx, sqlSelectEvents, sessionID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("stream/store: query events: %w", err)
	}
	defer rows.Close()

	return scanEventRows(rows)
}

// GetTimeline builds a condensed Timeline for a session from tool_use events.
func (st *Store) GetTimeline(ctx context.Context, sessionID string) (*Timeline, error) {
	rows, err := st.db.QueryContext(ctx, sqlSelectAll, sessionID)
	if err != nil {
		return nil, fmt.Errorf("stream/store: query timeline: %w", err)
	}
	defer rows.Close()

	events, err := scanEventRows(rows)
	if err != nil {
		return nil, err
	}

	tl := &Timeline{SessionID: sessionID}
	for i := range events {
		ev := &events[i]
		tl.TotalTokens += ev.InputTokens + ev.OutputTokens
		tl.TotalCost += ev.CostMicros

		// Only tool_use events (and usage events) make it into the timeline points
		if ev.Type == EventToolUse || ev.Type == EventSystem {
			tl.Events = append(tl.Events, TimelinePoint{
				SeqNum:    ev.SeqNum,
				Type:      ev.Type,
				ToolName:  ev.ToolName,
				FilePath:  ev.FilePath,
				Timestamp: ev.Timestamp,
				CostDelta: ev.CostMicros,
			})
		}
	}

	return tl, nil
}

// CountEvents returns the total number of events stored for a session.
func (st *Store) CountEvents(ctx context.Context, sessionID string) (int, error) {
	var count int
	if err := st.db.QueryRowContext(ctx, sqlCountEvents, sessionID).Scan(&count); err != nil {
		return 0, fmt.Errorf("stream/store: count events: %w", err)
	}
	return count, nil
}

// scanEventRows deserialises a result set of (id, session_id, type, data, timestamp) rows.
func scanEventRows(rows *sql.Rows) ([]Event, error) {
	var events []Event
	for rows.Next() {
		var (
			id        int64
			sessionID string
			evType    string
			data      string
			timestamp int64
		)
		if err := rows.Scan(&id, &sessionID, &evType, &data, &timestamp); err != nil {
			return nil, fmt.Errorf("stream/store: scan row: %w", err)
		}
		var ev Event
		if err := json.Unmarshal([]byte(data), &ev); err != nil {
			// Fall back to minimal struct if JSON is corrupt
			ev = Event{
				SessionID: sessionID,
				Type:      EventType(evType),
				Timestamp: timestamp,
			}
		}
		events = append(events, ev)
	}
	return events, rows.Err()
}
