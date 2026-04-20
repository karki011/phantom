// stress_test.go — high-concurrency tests for the stream package.
// Run with: go test -race -count=1 -timeout=120s ./internal/stream/...
// Author: Subash Karki

package stream

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// openStreamDB creates a temp-file SQLite DB with WAL mode and the session_events
// table. A temp file is used instead of ":memory:" because modernc.org/sqlite
// ":memory:" databases are per-connection; multiple goroutines opening separate
// connections would each get an isolated empty DB.
func openStreamDB(t *testing.T) *sql.DB {
	t.Helper()
	dbPath := fmt.Sprintf("%s/stream_stress_%d.db", t.TempDir(), time.Now().UnixNano())
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open stream db: %v", err)
	}
	// WAL mode allows concurrent readers + 1 writer without SQLITE_BUSY errors.
	if _, err := db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		t.Fatalf("set WAL mode: %v", err)
	}
	// Limit write concurrency: SQLite handles one writer at a time; pool=1
	// avoids "database is locked" while still allowing concurrent queries via WAL.
	db.SetMaxOpenConns(1)

	t.Cleanup(func() { db.Close() })

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS session_events (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id TEXT    NOT NULL,
		type       TEXT    NOT NULL,
		data       TEXT    NOT NULL DEFAULT '{}',
		timestamp  INTEGER NOT NULL DEFAULT 0
	)`)
	if err != nil {
		t.Fatalf("create session_events: %v", err)
	}
	return db
}

// TestStress_ParserConcurrent runs 100 goroutines each creating their own Parser
// and parsing 1000 lines. Validates independent state and no races.
func TestStress_ParserConcurrent(t *testing.T) {
	t.Parallel()

	const (
		goroutines = 100
		linesEach  = 1000
	)

	line := []byte(`{"type":"human","message":{"role":"user","content":"Hello stress"}}`)

	var wg sync.WaitGroup
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			sessID := fmt.Sprintf("stress-parser-%04d", id)
			p := NewParser(sessID)
			for j := 0; j < linesEach; j++ {
				ev := p.ParseLine(line)
				if ev == nil {
					continue
				}
				if ev.SessionID != sessID {
					t.Errorf("parser %d: expected sessionID %s, got %s", id, sessID, ev.SessionID)
				}
			}
		}(i)
	}

	wg.Wait()
}

// TestStress_StoreConcurrentSaves launches 50 goroutines each saving 100 events
// with unique session IDs. Verifies total count == 5000 and no data corruption.
func TestStress_StoreConcurrentSaves(t *testing.T) {
	t.Parallel()

	const (
		goroutines    = 50
		eventsPerGoro = 100
		total         = goroutines * eventsPerGoro
	)

	db := openStreamDB(t)
	st := NewStore(db)
	ctx := context.Background()

	var wg sync.WaitGroup
	var errCount int32

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(gid int) {
			defer wg.Done()
			sessID := fmt.Sprintf("stress-store-%04d", gid)
			for j := 0; j < eventsPerGoro; j++ {
				ev := &Event{
					ID:        fmt.Sprintf("%04d-%04d", gid, j),
					SessionID: sessID,
					Type:      EventUser,
					Timestamp: int64(j),
					SeqNum:    j,
					Content:   fmt.Sprintf("content-%d-%d", gid, j),
				}
				if err := st.SaveEvent(ctx, ev); err != nil {
					atomic.AddInt32(&errCount, 1)
				}
			}
		}(i)
	}

	wg.Wait()

	if errCount > 0 {
		t.Errorf("%d save errors occurred", errCount)
	}

	// Verify total row count.
	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM session_events`).Scan(&count); err != nil {
		t.Fatalf("count query: %v", err)
	}
	if count != total {
		t.Errorf("expected %d total events, got %d", total, count)
	}
}

// TestStress_StoreBatchConcurrent runs 20 goroutines each calling SaveBatch with
// 50 events. Verifies total == 1000 and all events are retrievable.
func TestStress_StoreBatchConcurrent(t *testing.T) {
	t.Parallel()

	const (
		goroutines = 20
		batchSize  = 50
		total      = goroutines * batchSize
	)

	db := openStreamDB(t)
	st := NewStore(db)
	ctx := context.Background()

	var wg sync.WaitGroup
	var errCount int32

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(gid int) {
			defer wg.Done()
			sessID := fmt.Sprintf("stress-batch-%04d", gid)
			events := make([]Event, batchSize)
			for j := 0; j < batchSize; j++ {
				events[j] = Event{
					ID:        fmt.Sprintf("batch-%04d-%04d", gid, j),
					SessionID: sessID,
					Type:      EventAssistant,
					Timestamp: int64(j),
					SeqNum:    j,
					Content:   fmt.Sprintf("batch-content-%d-%d", gid, j),
				}
			}
			if err := st.SaveBatch(ctx, events); err != nil {
				atomic.AddInt32(&errCount, 1)
			}
		}(i)
	}

	wg.Wait()

	if errCount > 0 {
		t.Errorf("%d batch-save errors", errCount)
	}

	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM session_events`).Scan(&count); err != nil {
		t.Fatalf("count query: %v", err)
	}
	if count != total {
		t.Errorf("expected %d total events, got %d", total, count)
	}
}

// TestStress_ScannerConcurrentReads writes a 10K-line JSONL file and has 50
// goroutines each call ScanAll. Verifies all return the same event count.
func TestStress_ScannerConcurrentReads(t *testing.T) {
	t.Parallel()

	const (
		numLines   = 10_000
		goroutines = 50
	)

	// Build a temp JSONL file.
	f, err := os.CreateTemp(t.TempDir(), "stress-scanner-*.jsonl")
	if err != nil {
		t.Fatalf("create temp: %v", err)
	}
	line := `{"type":"human","message":{"role":"user","content":"stress"}}` + "\n"
	for i := 0; i < numLines; i++ {
		if _, err := f.WriteString(line); err != nil {
			t.Fatalf("write line %d: %v", i, err)
		}
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	filePath := f.Name()

	// Baseline count.
	baseScanner := NewScanner("stress-base", filePath)
	baseEvents, err := baseScanner.ScanAll()
	if err != nil {
		t.Fatalf("baseline ScanAll: %v", err)
	}
	wantCount := len(baseEvents)

	var wg sync.WaitGroup
	var mismatchCount int32

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			sc := NewScanner(fmt.Sprintf("stress-scan-%04d", id), filePath)
			events, err := sc.ScanAll()
			if err != nil {
				t.Errorf("goroutine %d ScanAll: %v", id, err)
				return
			}
			if len(events) != wantCount {
				atomic.AddInt32(&mismatchCount, 1)
				t.Errorf("goroutine %d: expected %d events, got %d", id, wantCount, len(events))
			}
		}(i)
	}

	wg.Wait()

	if mismatchCount > 0 {
		t.Errorf("%d goroutines returned wrong event count", mismatchCount)
	}
}

// TestStress_TailWithConcurrentWrites starts a Tail on a temp file and has
// 10 goroutines appending lines simultaneously. Verifies all lines are received
// within 5 seconds.
func TestStress_TailWithConcurrentWrites(t *testing.T) {
	t.Parallel()

	const (
		writers       = 10
		linesPerWriter = 10
		totalLines    = writers * linesPerWriter
	)

	f, err := os.CreateTemp(t.TempDir(), "stress-tail-*.jsonl")
	if err != nil {
		t.Fatalf("create temp: %v", err)
	}
	filePath := f.Name()
	// Keep file open for appending below.
	f.Close()

	sc := NewScanner("stress-tail", filePath)
	ch := make(chan Event, totalLines*2)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		errCh <- sc.Tail(ctx, ch)
	}()

	// Give the tailer a moment to start polling.
	time.Sleep(200 * time.Millisecond)

	// Concurrent writers.
	line := `{"type":"human","message":{"role":"user","content":"tail-stress"}}` + "\n"
	var wg sync.WaitGroup
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			appFile, err := os.OpenFile(filePath, os.O_APPEND|os.O_WRONLY, 0644)
			if err != nil {
				t.Errorf("writer %d open: %v", id, err)
				return
			}
			defer appFile.Close()
			for j := 0; j < linesPerWriter; j++ {
				if _, err := appFile.WriteString(line); err != nil {
					t.Errorf("writer %d write %d: %v", id, j, err)
				}
				_ = appFile.Sync()
				time.Sleep(10 * time.Millisecond)
			}
		}(i)
	}
	wg.Wait()

	// Collect events until we have all or hit timeout.
	received := 0
	deadline := time.After(5 * time.Second)
	for received < totalLines {
		select {
		case _, ok := <-ch:
			if !ok {
				goto done
			}
			received++
		case <-deadline:
			t.Logf("received %d/%d events before deadline", received, totalLines)
			goto done
		}
	}
done:
	cancel()

	if received < totalLines {
		t.Errorf("expected at least %d events via Tail, got %d", totalLines, received)
	}
}
