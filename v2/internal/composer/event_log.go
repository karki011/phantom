// Author: Subash Karki
//
// event_log.go — NDJSON (newline-delimited JSON) event persistence.
// Each StreamEvent is appended as a single JSON line, enabling cheap
// append-only writes during a streaming session and fast replay on
// re-open. Designed to complement the SQLite persistence in persist.go
// with a file-based log that survives DB corruption and can be shipped
// to external tooling without a SQL dependency.
package composer

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// EventLog writes StreamEvents as newline-delimited JSON to a file.
// All writes are mutex-protected so concurrent goroutines (e.g. the
// stream reader + a flush timer) can safely append.
type EventLog struct {
	mu   sync.Mutex
	file *os.File
	enc  *json.Encoder
}

// NewEventLog opens (or creates) the NDJSON file at path for append-only
// writes. Parent directories are created automatically.
func NewEventLog(path string) (*EventLog, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, fmt.Errorf("event log mkdir: %w", err)
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, fmt.Errorf("event log open: %w", err)
	}
	return &EventLog{
		file: f,
		enc:  json.NewEncoder(f),
	}, nil
}

// Append serialises ev as a single JSON line and flushes to disk.
func (l *EventLog) Append(ev StreamEvent) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.enc.Encode(ev)
}

// Close closes the underlying file.
func (l *EventLog) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.file.Close()
}

// ReadEventLog reads every event from the NDJSON file at path.
// Empty lines and lines that fail to parse are silently skipped.
func ReadEventLog(path string) ([]StreamEvent, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("read event log: %w", err)
	}
	defer f.Close()

	var events []StreamEvent
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var ev StreamEvent
		if err := json.Unmarshal(line, &ev); err != nil {
			continue // skip malformed lines
		}
		events = append(events, ev)
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("scan event log: %w", err)
	}
	return events, nil
}

// ReadEventLogTail returns the last n events from the NDJSON file.
// If the file contains fewer than n events, all events are returned.
func ReadEventLogTail(path string, n int) ([]StreamEvent, error) {
	all, err := ReadEventLog(path)
	if err != nil {
		return nil, err
	}
	if n >= len(all) {
		return all, nil
	}
	return all[len(all)-n:], nil
}
