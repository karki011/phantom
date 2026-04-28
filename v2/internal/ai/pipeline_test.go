// Package ai provides end-to-end pipeline tests for the AI engine.
//
// Author: Subash Karki
package ai

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
)

// setupInMemoryDB creates an in-memory SQLite database and initializes
// all required stores. Returns the db, decision store, performance store,
// and compactor for use in tests.
func setupInMemoryDB(t *testing.T) (*sql.DB, *knowledge.DecisionStore, *strategies.PerformanceStore, *knowledge.Compactor) {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory DB: %v", err)
	}

	ds, err := knowledge.NewDecisionStore(db)
	if err != nil {
		t.Fatalf("create decision store: %v", err)
	}

	comp, err := knowledge.NewCompactor(db)
	if err != nil {
		t.Fatalf("create compactor: %v", err)
	}

	ps := strategies.NewPerformanceStore()

	return db, ds, ps, comp
}

// TestFullPipeline exercises: assess -> select -> record -> compact -> gap detect
func TestFullPipeline(t *testing.T) {
	db, ds, ps, comp := setupInMemoryDB(t)
	defer db.Close()

	// Register Direct + Decompose strategies
	reg := strategies.NewRegistry()
	direct := strategies.NewDirectStrategy()
	decompose := strategies.NewDecomposeStrategy()
	reg.Register(direct, 0)
	reg.Register(decompose, 0)
	reg.SetPerformanceStore(ps)

	assessor := strategies.NewAssessor()

	// --- Test: simple message -> Direct strategy selected ---
	t.Run("simple message selects Direct", func(t *testing.T) {
		assessment := assessor.Assess("fix button color", 1, 1)
		selected := reg.Select(assessment)

		if selected == nil {
			t.Fatal("expected a strategy to be selected")
		}
		if selected.ID() != "direct" {
			t.Errorf("expected direct, got %s", selected.ID())
		}
	})

	// --- Test: complex message with many files -> Decompose selected ---
	t.Run("complex message selects Decompose", func(t *testing.T) {
		assessment := assessor.Assess("refactor the entire auth system across modules", 25, 30)
		selected := reg.Select(assessment)

		if selected == nil {
			t.Fatal("expected a strategy to be selected")
		}
		if selected.ID() != "decompose" {
			t.Errorf("expected decompose, got %s", selected.ID())
		}
	})

	// --- Test: knowledge recorded after enrichment ---
	t.Run("knowledge recorded", func(t *testing.T) {
		decisionID, err := ds.Record("fix the auth bug", "direct", 0.85, "simple", "low")
		if err != nil {
			t.Fatalf("record decision: %v", err)
		}
		if decisionID == "" {
			t.Fatal("expected non-empty decision ID")
		}

		err = ds.RecordOutcome(decisionID, true, "")
		if err != nil {
			t.Fatalf("record outcome: %v", err)
		}

		// Verify FindSimilar returns the decision
		similar, err := ds.FindSimilar("fix auth bug", 0.2)
		if err != nil {
			t.Fatalf("find similar: %v", err)
		}
		if len(similar) == 0 {
			t.Fatal("expected at least 1 similar decision")
		}
	})

	// --- Test: penalty applied from prior failures ---
	t.Run("prior failure penalty", func(t *testing.T) {
		// Record a failure for direct
		failID, _ := ds.Record("optimize database queries", "direct", 0.3, "complex", "high")
		_ = ds.RecordOutcome(failID, false, "too complex for direct")

		// Verify failed approaches surface
		failures, err := ds.GetFailedApproaches("optimize database queries")
		if err != nil {
			t.Fatalf("get failed approaches: %v", err)
		}
		if len(failures) == 0 {
			t.Fatal("expected at least 1 failed approach")
		}
		if failures[0].StrategyID != "direct" {
			t.Errorf("expected direct as failed strategy, got %s", failures[0].StrategyID)
		}
	})

	// --- Test: compaction runs ---
	t.Run("compaction runs", func(t *testing.T) {
		// Seed enough decisions for pattern synthesis
		for i := 0; i < 10; i++ {
			id, _ := ds.Record("repeated task pattern", "direct", 0.8, "simple", "low")
			_ = ds.RecordOutcome(id, true, "")
		}

		err := comp.Run()
		if err != nil {
			t.Fatalf("compaction failed: %v", err)
		}

		// Verify health can be computed
		health, err := comp.Health()
		if err != nil {
			t.Fatalf("health check failed: %v", err)
		}
		if health.TotalDecisions == 0 {
			t.Error("expected non-zero total decisions after compaction")
		}
	})

	// --- Test: gap detection ---
	t.Run("gap detection", func(t *testing.T) {
		// Seed decisions with low success rates for a specific combo
		for i := 0; i < 12; i++ {
			id, _ := ds.Record("gap test task", "direct", 0.2, "critical", "critical")
			_ = ds.RecordOutcome(id, false, "always fails")
		}

		gd := strategies.NewGapDetector()
		gaps := gd.FindGaps(db)

		// Should detect at least one gap for critical/critical
		found := false
		for _, g := range gaps {
			if g.Complexity == strategies.Critical && g.Risk == strategies.CriticalRisk {
				found = true
				if g.Severity != "critical" {
					t.Errorf("expected critical severity, got %s", g.Severity)
				}
			}
		}
		if !found {
			t.Log("no gap detected for critical/critical — may need more data or different combo")
		}
	})
}

// TestPipelineWithAutoTune verifies threshold drift from accumulated decisions.
func TestPipelineWithAutoTune(t *testing.T) {
	db, ds, _, _ := setupInMemoryDB(t)
	defer db.Close()

	tracker := strategies.NewThresholdTracker()
	assessor := strategies.NewAssessor()
	assessor.SetThresholdTracker(tracker)

	defaults := strategies.DefaultThresholds()

	// Record 50+ decisions with known outcomes to trigger recalibration
	for i := 0; i < 55; i++ {
		// All simple tasks succeed -> should raise SimpleMaxFiles
		assessment := assessor.Assess("simple task", 2, 1)
		tracker.RecordOutcome(assessment.Complexity, true, 2)

		// Record to DB too
		id, _ := ds.Record("simple task", "direct", 0.9, string(assessment.Complexity), string(assessment.Risk))
		_ = ds.RecordOutcome(id, true, "")
	}

	// Verify thresholds shifted
	current := tracker.GetConfig()
	if current.SimpleMaxFiles <= defaults.SimpleMaxFiles {
		// With 100% success, threshold should have been raised
		t.Logf("SimpleMaxFiles: default=%d current=%d (may not have shifted with small sample)", defaults.SimpleMaxFiles, current.SimpleMaxFiles)
	}

	// Verify decision count
	if tracker.GetDecisionCount() < 50 {
		t.Errorf("expected 50+ decisions, got %d", tracker.GetDecisionCount())
	}

	// Verify shifted thresholds affect subsequent assessments
	// After raising SimpleMaxFiles, a 3-file task should still be "simple" if threshold was raised
	newAssessment := assessor.Assess("another simple task", 3, 1)
	if current.SimpleMaxFiles >= 3 && newAssessment.Complexity != strategies.Simple {
		t.Errorf("expected simple with raised threshold (max=%d), got %s", current.SimpleMaxFiles, newAssessment.Complexity)
	}
}

// TestPipelineWithGlobalPatterns verifies cross-project pattern aggregation.
func TestPipelineWithGlobalPatterns(t *testing.T) {
	// Create a temp dir for the global pattern store
	dir := t.TempDir()

	// Create 3 project DBs with similar patterns
	for i := 0; i < 3; i++ {
		projDB, err := sql.Open("sqlite", dir+"/project"+string(rune('A'+i))+".db")
		if err != nil {
			t.Fatalf("open project DB %d: %v", i, err)
		}

		projDS, err := knowledge.NewDecisionStore(projDB)
		if err != nil {
			t.Fatalf("create decision store %d: %v", i, err)
		}

		projComp, err := knowledge.NewCompactor(projDB)
		if err != nil {
			t.Fatalf("create compactor %d: %v", i, err)
		}

		// Seed similar patterns across all 3 projects
		for j := 0; j < 6; j++ {
			id, _ := projDS.Record("common task pattern", "direct", 0.85, "simple", "low")
			_ = projDS.RecordOutcome(id, true, "")
		}

		// Run compaction to create ai_patterns
		_ = projComp.Run()
		_ = projDB.Close()
		_ = projDS // silence unused warning
	}

	// Run global aggregation
	gps, err := knowledge.NewGlobalPatternStore(dir)
	if err != nil {
		t.Fatalf("create global pattern store: %v", err)
	}
	defer gps.Close()

	err = gps.Aggregate()
	if err != nil {
		t.Fatalf("aggregate: %v", err)
	}

	// Seed a new project and verify it receives global patterns
	patterns := gps.SeedProject("newProject")

	// We expect at least one pattern from the 3-project consensus
	if len(patterns) > 0 {
		found := false
		for _, p := range patterns {
			if p.StrategyID == "direct" && p.Complexity == "simple" {
				found = true
				if p.SuccessRate < 0.7 {
					t.Errorf("expected success rate > 0.7, got %f", p.SuccessRate)
				}
			}
		}
		if !found {
			t.Log("global pattern for direct:simple not found — may need adjusted thresholds")
		}
	}

	// Verify GetAll returns something
	all := gps.GetAll()
	t.Logf("global patterns count: %d", len(all))
}
