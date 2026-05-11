// Author: Subash Karki
package detect_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/detect"
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

// mockDetector is a configurable Detector for testing.
type mockDetector struct {
	name  string
	hints []detect.Hint
	err   error
	delay time.Duration // simulates slow detectors
	calls atomic.Int64
}

func (m *mockDetector) Name() string { return m.name }

func (m *mockDetector) Detect(ctx context.Context, _ *detect.DetectorInput) ([]detect.Hint, error) {
	m.calls.Add(1)
	if m.delay > 0 {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(m.delay):
		}
	}
	return m.hints, m.err
}

func hint(key, value string, conf float64, src string) detect.Hint {
	return detect.Hint{Key: key, Value: value, Confidence: conf, Source: src}
}

// ─── Coordinator tests ───────────────────────────────────────────────────────

func TestCoordinator_NoDetectors(t *testing.T) {
	c := detect.NewCoordinator()
	hints, err := c.Analyze(context.Background(), &detect.DetectorInput{Goal: "test"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(hints) != 0 {
		t.Fatalf("expected empty hints, got %v", hints)
	}
}

func TestCoordinator_Sequential(t *testing.T) {
	d1 := &mockDetector{name: "d1", hints: []detect.Hint{hint("k1", "v1", 0.9, "d1")}}
	d2 := &mockDetector{name: "d2", hints: []detect.Hint{hint("k2", "v2", 0.8, "d2")}}

	// threshold=3, 2 detectors → sequential
	c := detect.NewCoordinator(d1, d2)
	hints, err := c.Analyze(context.Background(), &detect.DetectorInput{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(hints) != 2 {
		t.Fatalf("expected 2 hints, got %d: %v", len(hints), hints)
	}
	if d1.calls.Load() != 1 || d2.calls.Load() != 1 {
		t.Fatal("both detectors should have been called once")
	}
}

func TestCoordinator_Parallel(t *testing.T) {
	d1 := &mockDetector{name: "d1", hints: []detect.Hint{hint("k1", "v1", 0.9, "d1")}}
	d2 := &mockDetector{name: "d2", hints: []detect.Hint{hint("k2", "v2", 0.8, "d2")}}
	d3 := &mockDetector{name: "d3", hints: []detect.Hint{hint("k3", "v3", 0.7, "d3")}}
	d4 := &mockDetector{name: "d4", hints: []detect.Hint{hint("k4", "v4", 0.6, "d4")}}

	// 4 detectors > default threshold of 3 → parallel
	c := detect.NewCoordinator(d1, d2, d3, d4)
	hints, err := c.Analyze(context.Background(), &detect.DetectorInput{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(hints) != 4 {
		t.Fatalf("expected 4 hints, got %d", len(hints))
	}
	for _, d := range []*mockDetector{d1, d2, d3, d4} {
		if d.calls.Load() != 1 {
			t.Fatalf("detector %s should have been called once", d.name)
		}
	}
}

func TestCoordinator_HintMerge_HighestConfidenceWins(t *testing.T) {
	d1 := &mockDetector{name: "d1", hints: []detect.Hint{hint("complexity", "low", 0.4, "d1")}}
	d2 := &mockDetector{name: "d2", hints: []detect.Hint{hint("complexity", "high", 0.9, "d2")}}
	d3 := &mockDetector{name: "d3", hints: []detect.Hint{hint("complexity", "medium", 0.6, "d3")}}

	// Force sequential (only 3 detectors, threshold default=3)
	c := detect.NewCoordinator(d1, d2, d3)
	hints, err := c.Analyze(context.Background(), &detect.DetectorInput{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(hints) != 1 {
		t.Fatalf("expected 1 merged hint, got %d: %v", len(hints), hints)
	}
	if hints[0].Value != "high" || hints[0].Confidence != 0.9 {
		t.Fatalf("expected high/0.9, got %s/%.1f", hints[0].Value, hints[0].Confidence)
	}
}

func TestCoordinator_TieBreak_FirstWins(t *testing.T) {
	d1 := &mockDetector{name: "d1", hints: []detect.Hint{hint("k", "first", 0.7, "d1")}}
	d2 := &mockDetector{name: "d2", hints: []detect.Hint{hint("k", "second", 0.7, "d2")}}

	c := detect.NewCoordinator(d1, d2)
	hints, err := c.Analyze(context.Background(), &detect.DetectorInput{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(hints) != 1 {
		t.Fatalf("expected 1 hint, got %d", len(hints))
	}
	if hints[0].Value != "first" {
		t.Fatalf("expected first to win tie, got %q", hints[0].Value)
	}
}

func TestCoordinator_DetectorError_NonFatal(t *testing.T) {
	boom := errors.New("boom")
	d1 := &mockDetector{name: "d1", err: boom}
	d2 := &mockDetector{name: "d2", hints: []detect.Hint{hint("k", "v", 0.8, "d2")}}

	c := detect.NewCoordinator(d1, d2)
	hints, err := c.Analyze(context.Background(), &detect.DetectorInput{})
	if !errors.Is(err, boom) {
		t.Fatalf("expected boom error, got %v", err)
	}
	if len(hints) != 1 || hints[0].Value != "v" {
		t.Fatalf("expected partial result from d2, got %v", hints)
	}
}

func TestCoordinator_ContextTimeout(t *testing.T) {
	// Slow detector that blocks for 500ms
	slow := &mockDetector{name: "slow", delay: 500 * time.Millisecond}

	// Force parallel by using threshold=0 override
	c := detect.NewCoordinator(slow, slow, slow, slow).WithParallelThreshold(0)

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	start := time.Now()
	_, err := c.Analyze(ctx, &detect.DetectorInput{})
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("expected context error")
	}
	// Should have returned well before the 500ms detector delay
	if elapsed > 200*time.Millisecond {
		t.Fatalf("coordinator didn't respect context timeout, elapsed=%v", elapsed)
	}
}

// ─── FileComplexityDetector tests ────────────────────────────────────────────

func TestFileComplexityDetector_Empty(t *testing.T) {
	d := &detect.FileComplexityDetector{}
	hints, err := d.Detect(context.Background(), &detect.DetectorInput{})
	if err != nil {
		t.Fatal(err)
	}
	found := hintByKey(hints, "complexity")
	if found == nil || found.Value != "low" {
		t.Fatalf("0 files should yield low complexity, got %v", found)
	}
}

func TestFileComplexityDetector_Tiers(t *testing.T) {
	cases := []struct {
		files    int
		wantTier string
	}{
		{1, "low"},
		{3, "low"},
		{4, "medium"},
		{10, "medium"},
		{11, "high"},
		{25, "high"},
		{26, "critical"},
	}

	d := &detect.FileComplexityDetector{}
	for _, tc := range cases {
		files := make([]string, tc.files)
		for i := range files {
			files[i] = "file.go"
		}
		hints, err := d.Detect(context.Background(), &detect.DetectorInput{Files: files})
		if err != nil {
			t.Fatal(err)
		}
		got := hintByKey(hints, "complexity")
		if got == nil || got.Value != tc.wantTier {
			t.Errorf("files=%d: want %s, got %v", tc.files, tc.wantTier, got)
		}
	}
}

// ─── WorkTypeDetector tests ───────────────────────────────────────────────────

func TestWorkTypeDetector(t *testing.T) {
	cases := []struct {
		goal     string
		wantType string
	}{
		{"fix the login bug", "bugfix"},
		{"refactor the auth module", "refactor"},
		{"add user profile feature", "feature"},
		{"write unit tests for payments", "test"},
		{"update the README docs", "docs"},
		{"optimize query performance", "perf"},
		{"deploy to production pipeline", "devops"},
		{"something with no clear type", ""},
	}

	d := &detect.WorkTypeDetector{}
	for _, tc := range cases {
		hints, err := d.Detect(context.Background(), &detect.DetectorInput{Goal: tc.goal})
		if err != nil {
			t.Fatalf("goal=%q: unexpected error: %v", tc.goal, err)
		}
		got := hintByKey(hints, "work_type")
		if tc.wantType == "" {
			if got != nil {
				t.Errorf("goal=%q: expected no hint, got %v", tc.goal, got)
			}
			continue
		}
		if got == nil || got.Value != tc.wantType {
			t.Errorf("goal=%q: want %q, got %v", tc.goal, tc.wantType, got)
		}
	}
}

// ─── BranchContextDetector tests ─────────────────────────────────────────────

func TestBranchContextDetector_TicketExtraction(t *testing.T) {
	cases := []struct {
		branch     string
		wantTicket string
		wantType   string
	}{
		{"feature/ABC-123-login", "ABC-123", "feature"},
		{"fix/PROJ-456-crash", "PROJ-456", "fix"},
		{"hotfix/gh-89-security", "GH-89", "hotfix"},
		{"chore/cleanup", "", "chore"},
		{"main", "", ""},
		{"", "", ""},
	}

	d := &detect.BranchContextDetector{}
	for _, tc := range cases {
		hints, err := d.Detect(context.Background(), &detect.DetectorInput{BranchName: tc.branch})
		if err != nil {
			t.Fatalf("branch=%q: unexpected error: %v", tc.branch, err)
		}

		ticket := hintByKey(hints, "ticket")
		if tc.wantTicket == "" {
			if ticket != nil {
				t.Errorf("branch=%q: expected no ticket hint, got %v", tc.branch, ticket)
			}
		} else if ticket == nil || ticket.Value != tc.wantTicket {
			t.Errorf("branch=%q: want ticket=%q, got %v", tc.branch, tc.wantTicket, ticket)
		}

		btype := hintByKey(hints, "branch_type")
		if tc.wantType == "" {
			if btype != nil {
				t.Errorf("branch=%q: expected no type hint, got %v", tc.branch, btype)
			}
		} else if btype == nil || btype.Value != tc.wantType {
			t.Errorf("branch=%q: want type=%q, got %v", tc.branch, tc.wantType, btype)
		}
	}
}

// ─── Utilities ───────────────────────────────────────────────────────────────

func hintByKey(hints []detect.Hint, key string) *detect.Hint {
	for i := range hints {
		if hints[i].Key == key {
			return &hints[i]
		}
	}
	return nil
}
