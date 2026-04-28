// Package metrics tests for PipelineMetrics.
//
// Author: Subash Karki
package metrics

import (
	"testing"
	"time"
)

func TestRecordStage(t *testing.T) {
	pm := New()

	pm.RecordStage(StageContextGather, 5*time.Millisecond)
	pm.RecordStage(StageContextGather, 10*time.Millisecond)
	pm.RecordStage(StageContextGather, 15*time.Millisecond)

	snap := pm.Snapshot()
	stats, ok := snap.StageTiming[StageContextGather]
	if !ok {
		t.Fatal("expected context_gather in stage timing")
	}
	if stats.Count != 3 {
		t.Errorf("expected 3 samples, got %d", stats.Count)
	}
	if stats.Min != 5*time.Millisecond {
		t.Errorf("expected min 5ms, got %v", stats.Min)
	}
	if stats.Max != 15*time.Millisecond {
		t.Errorf("expected max 15ms, got %v", stats.Max)
	}
}

func TestRecordHookLatency(t *testing.T) {
	pm := New()

	pm.RecordHookLatency("before_edit", 2*time.Millisecond)
	pm.RecordHookLatency("before_edit", 8*time.Millisecond)

	snap := pm.Snapshot()
	stats, ok := snap.HookLatency["before_edit"]
	if !ok {
		t.Fatal("expected before_edit in hook latency")
	}
	if stats.Count != 2 {
		t.Errorf("expected 2 samples, got %d", stats.Count)
	}
}

func TestRollingWindowEviction(t *testing.T) {
	pm := New()

	// Fill past the window size
	for i := 0; i < DefaultWindowSize+20; i++ {
		pm.RecordStage(StageAssessment, time.Duration(i)*time.Millisecond)
	}

	snap := pm.Snapshot()
	stats := snap.StageTiming[StageAssessment]
	if stats.Count != DefaultWindowSize {
		t.Errorf("expected %d samples after eviction, got %d", DefaultWindowSize, stats.Count)
	}
	// Oldest 20 were evicted, so min should be 20ms
	if stats.Min != 20*time.Millisecond {
		t.Errorf("expected min 20ms after eviction, got %v", stats.Min)
	}
}

func TestRecordDecisionQuality(t *testing.T) {
	pm := New()

	pm.RecordDecisionQuality(0.85, 100)
	pm.RecordDecisionQuality(0.90, 150)

	snap := pm.Snapshot()
	if len(snap.DecisionQuality) != 2 {
		t.Errorf("expected 2 quality points, got %d", len(snap.DecisionQuality))
	}
	if snap.DecisionQuality[0].SuccessRate != 0.85 {
		t.Errorf("expected 0.85 success rate, got %f", snap.DecisionQuality[0].SuccessRate)
	}
}

func TestQualityPointsEviction(t *testing.T) {
	pm := New()

	for i := 0; i < MaxQualityPoints+10; i++ {
		pm.RecordDecisionQuality(float64(i)/100, i)
	}

	snap := pm.Snapshot()
	if len(snap.DecisionQuality) != MaxQualityPoints {
		t.Errorf("expected %d quality points after eviction, got %d", MaxQualityPoints, len(snap.DecisionQuality))
	}
}

func TestRecordKnowledgeGrowth(t *testing.T) {
	pm := New()

	pm.RecordKnowledgeGrowth(10, 2, 0)
	pm.RecordKnowledgeGrowth(20, 5, 1)

	snap := pm.Snapshot()
	if len(snap.KnowledgeGrowth) != 2 {
		t.Errorf("expected 2 growth points, got %d", len(snap.KnowledgeGrowth))
	}
	if snap.KnowledgeGrowth[1].Decisions != 20 {
		t.Errorf("expected 20 decisions, got %d", snap.KnowledgeGrowth[1].Decisions)
	}
	if snap.KnowledgeGrowth[1].GapCount != 1 {
		t.Errorf("expected 1 gap, got %d", snap.KnowledgeGrowth[1].GapCount)
	}
}

func TestEmptySnapshot(t *testing.T) {
	pm := New()

	snap := pm.Snapshot()
	if len(snap.StageTiming) != 0 {
		t.Error("expected empty stage timing")
	}
	if len(snap.HookLatency) != 0 {
		t.Error("expected empty hook latency")
	}
	if len(snap.DecisionQuality) != 0 {
		t.Error("expected empty decision quality")
	}
	if len(snap.KnowledgeGrowth) != 0 {
		t.Error("expected empty knowledge growth")
	}
}

func TestMultipleStages(t *testing.T) {
	pm := New()

	stages := []string{StageContextGather, StageBlastRadius, StageAssessment, StageStrategySelect, StageEnrich}
	for _, s := range stages {
		pm.RecordStage(s, 5*time.Millisecond)
	}

	snap := pm.Snapshot()
	for _, s := range stages {
		if _, ok := snap.StageTiming[s]; !ok {
			t.Errorf("expected stage %s in timing", s)
		}
	}
}

func TestTimingStatsPercentiles(t *testing.T) {
	pm := New()

	// Record 20 samples: 1ms, 2ms, ..., 20ms
	for i := 1; i <= 20; i++ {
		pm.RecordStage(StageTotal, time.Duration(i)*time.Millisecond)
	}

	snap := pm.Snapshot()
	stats := snap.StageTiming[StageTotal]

	if stats.P50 != 10*time.Millisecond {
		t.Errorf("expected P50=10ms, got %v", stats.P50)
	}
	// P95 of 20 items: index 19 -> 19ms (0-indexed) or 20ms
	// int(20*0.95) = 19 -> sorted[19] = 20ms
	if stats.P95 != 20*time.Millisecond {
		t.Errorf("expected P95=20ms, got %v", stats.P95)
	}
	if stats.Avg != 10*time.Millisecond+500*time.Microsecond {
		// (1+2+...+20)/20 = 210/20 = 10.5ms
		t.Logf("avg=%v (expected ~10.5ms)", stats.Avg)
	}
}

func TestConcurrentAccess(t *testing.T) {
	pm := New()
	done := make(chan struct{})

	// Write from multiple goroutines
	for i := 0; i < 10; i++ {
		go func(n int) {
			for j := 0; j < 100; j++ {
				pm.RecordStage(StageContextGather, time.Duration(n*100+j)*time.Microsecond)
				pm.RecordHookLatency("hook", time.Duration(j)*time.Microsecond)
			}
			done <- struct{}{}
		}(i)
	}

	// Read concurrently
	go func() {
		for i := 0; i < 50; i++ {
			_ = pm.Snapshot()
		}
		done <- struct{}{}
	}()

	// Wait for all goroutines
	for i := 0; i < 11; i++ {
		<-done
	}

	snap := pm.Snapshot()
	if snap.StageTiming[StageContextGather].Count == 0 {
		t.Error("expected non-zero samples after concurrent writes")
	}
}
