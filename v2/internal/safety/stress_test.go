// stress_test.go — high-concurrency tests for the safety package.
// Run with: go test -race -count=1 -timeout=120s ./internal/safety/...
// Author: Subash Karki

package safety

import (
	"context"
	"database/sql"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
	_ "modernc.org/sqlite"
)

// openAuditDB opens a temp-file SQLite DB with WAL mode and initialises the
// ward_audit table. Uses a file instead of ":memory:" so all goroutines share
// the same DB (modernc.org/sqlite ":memory:" is per-connection).
func openAuditDB(t *testing.T) *sql.DB {
	t.Helper()
	dbPath := fmt.Sprintf("%s/audit_stress_%d.db", t.TempDir(), time.Now().UnixNano())
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open audit db: %v", err)
	}
	if _, err := db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		t.Fatalf("set WAL: %v", err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })

	a := NewAuditStore(db)
	if err := a.Init(context.Background()); err != nil {
		t.Fatalf("init audit table: %v", err)
	}
	return db
}

// makeStressLoader returns a Loader pre-populated with n rules (no file I/O).
func makeStressLoader(n int) *Loader {
	rules := make([]Rule, n)
	for i := range rules {
		r := Rule{
			ID:      fmt.Sprintf("rule-%04d", i),
			Name:    fmt.Sprintf("Rule %d", i),
			Level:   LevelWarn,
			Tool:    "Bash",
			Enabled: true,
		}
		_ = r.Compile()
		rules[i] = r
	}
	l := &Loader{}
	l.rules = rules
	return l
}

// TestStress_EvaluatorConcurrent loads 20 rules and has 200 goroutines each
// evaluating a random event. Validates no races and that match counts are correct.
func TestStress_EvaluatorConcurrent(t *testing.T) {
	t.Parallel()

	const (
		numRules   = 20
		goroutines = 200
	)

	loader := makeStressLoader(numRules)
	ev := NewEvaluator(loader)

	tools := []string{"Bash", "Read", "Write", "Edit", "Glob"}
	var wg sync.WaitGroup
	var totalMatches int64

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			tool := tools[rand.Intn(len(tools))]
			event := &stream.Event{
				SessionID: fmt.Sprintf("sess-%04d", id),
				ToolName:  tool,
				ToolInput: fmt.Sprintf("input-%d", id),
			}
			evals := ev.Evaluate(event)
			atomic.AddInt64(&totalMatches, int64(len(evals)))

			// Bash always matches all 20 rules; others match 0.
			if tool == "Bash" && len(evals) != numRules {
				t.Errorf("goroutine %d (Bash): expected %d matches, got %d", id, numRules, len(evals))
			}
			if tool != "Bash" && len(evals) != 0 {
				t.Errorf("goroutine %d (%s): expected 0 matches, got %d", id, tool, len(evals))
			}
		}(i)
	}

	wg.Wait()
	t.Logf("total matches across %d goroutines: %d", goroutines, totalMatches)
}

// TestStress_LoaderHotReload starts a Loader watching a temp dir, has 50
// goroutines reading Rules() while 10 goroutines write new YAML files for 3s.
// Validates no races and no panics.
func TestStress_LoaderHotReload(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	loader := NewLoader(dir, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := loader.Start(ctx); err != nil {
		t.Fatalf("loader.Start: %v", err)
	}
	t.Cleanup(loader.Stop)

	if err := loader.Load(); err != nil {
		t.Fatalf("initial Load: %v", err)
	}

	runCtx, runCancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer runCancel()

	var wg sync.WaitGroup

	// 50 reader goroutines.
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-runCtx.Done():
					return
				default:
					rules := loader.Rules()
					_ = rules
				}
			}
		}()
	}

	// 10 writer goroutines that create/overwrite YAML rule files.
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			filename := filepath.Join(dir, fmt.Sprintf("rules-%04d.yaml", id))
			ticker := time.NewTicker(150 * time.Millisecond)
			defer ticker.Stop()
			seq := 0
			for {
				select {
				case <-runCtx.Done():
					return
				case <-ticker.C:
					yaml := fmt.Sprintf(`rules:
  - id: "stress-%04d-%04d"
    name: "Stress Rule %d-%d"
    level: warn
    tool: Bash
    enabled: true
`, id, seq, id, seq)
					_ = os.WriteFile(filename, []byte(yaml), 0644)
					seq++
				}
			}
		}(i)
	}

	wg.Wait()
}

// TestStress_AuditConcurrentRecords has 100 goroutines each recording 50 audit
// entries. Verifies total count == 5000 and Stats() returns correct totals.
func TestStress_AuditConcurrentRecords(t *testing.T) {
	t.Parallel()

	const (
		goroutines    = 100
		recordsPerGoro = 50
		total         = goroutines * recordsPerGoro
	)

	db := openAuditDB(t)
	audit := NewAuditStore(db)
	ctx := context.Background()

	var wg sync.WaitGroup
	var errCount int32

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(gid int) {
			defer wg.Done()
			for j := 0; j < recordsPerGoro; j++ {
				eval := Evaluation{
					RuleID:    fmt.Sprintf("rule-%04d", gid),
					RuleName:  fmt.Sprintf("Rule %d", gid),
					Level:     LevelWarn,
					SessionID: fmt.Sprintf("sess-%04d", gid),
					EventSeq:  j,
					ToolName:  "Bash",
					ToolInput: fmt.Sprintf("cmd-%d-%d", gid, j),
					Outcome:   "warned",
					Message:   "stress test",
					Timestamp: time.Now().UnixMilli(),
					Matched:   true,
				}
				if err := audit.Record(ctx, eval); err != nil {
					atomic.AddInt32(&errCount, 1)
				}
			}
		}(i)
	}

	wg.Wait()

	if errCount > 0 {
		t.Errorf("%d record errors", errCount)
	}

	stats, err := audit.Stats(ctx)
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	if stats.TotalTriggers != total {
		t.Errorf("expected %d total triggers, got %d", total, stats.TotalTriggers)
	}
}

// TestStress_PIIConcurrent has 100 goroutines each scanning different text strings.
// Validates no races and correct detection results.
func TestStress_PIIConcurrent(t *testing.T) {
	t.Parallel()

	const goroutines = 100

	testCases := []struct {
		text    string
		hasPII  bool
		piiType PIIType
	}{
		{"contact user@example.com for info", true, PIIEmail},
		{"key: AKIAIOSFODNN7EXAMPLE1234", true, PIIAWSKey},
		{"token ghp_abcdefghijklmnopqrstuvwxyz123", true, PIIToken},
		{"no sensitive data here just text", false, ""},
		{"api key: sk-abcdefghijklmnopqrstuvwxyz123456", true, PIIAPIKey},
	}

	var wg sync.WaitGroup
	var errCount int32

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			tc := testCases[id%len(testCases)]
			matches := ScanForPII(tc.text)
			if tc.hasPII && len(matches) == 0 {
				atomic.AddInt32(&errCount, 1)
				t.Errorf("goroutine %d: expected PII match in %q, got none", id, tc.text)
			}
			if !tc.hasPII && len(matches) > 0 {
				atomic.AddInt32(&errCount, 1)
				t.Errorf("goroutine %d: expected no PII in %q, got %+v", id, tc.text, matches)
			}

			// Also call MaskPII to verify no races.
			_ = MaskPII(tc.text)
		}(i)
	}

	wg.Wait()

	if errCount > 0 {
		t.Errorf("%d PII detection errors", errCount)
	}
}
