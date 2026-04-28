// Package metrics provides pipeline observability for the AI engine.
// PipelineMetrics tracks per-stage timing, decision quality, knowledge growth,
// and hook latency using bounded rolling windows.
//
// Design: zero-cost when not read — all computation is lazy in Snapshot().
// Thread-safe via sync.RWMutex.
//
// Author: Subash Karki
package metrics

import (
	"sync"
	"time"
)

// Stage name constants for the pipeline.
const (
	StageContextGather  = "context_gather"
	StageBlastRadius    = "blast_radius"
	StageAssessment     = "assessment"
	StageStrategySelect = "strategy_select"
	StageEnrich         = "enrich"
	StageKnowledgeWrite = "knowledge_write"
	StageVerification   = "verification"
	StageTotal          = "total"
)

// PipelineMetrics collects timing and quality metrics across the AI pipeline.
type PipelineMetrics struct {
	mu sync.RWMutex

	// Per-stage timing (rolling window of last N samples)
	stageTiming map[string]*timingWindow

	// Decision quality over time
	decisionQuality []qualityPoint

	// Knowledge growth rate
	knowledgeGrowth []growthPoint

	// Hook latency
	hookLatency map[string]*timingWindow
}

// timingWindow holds a bounded rolling window of duration samples.
type timingWindow struct {
	samples []time.Duration
	maxSize int
}

// add appends a sample, evicting the oldest if full.
func (tw *timingWindow) add(d time.Duration) {
	if len(tw.samples) >= tw.maxSize {
		tw.samples = tw.samples[1:]
	}
	tw.samples = append(tw.samples, d)
}

// stats computes min, max, avg, p50, p95 from the current window.
// Returns zero values if empty.
func (tw *timingWindow) stats() TimingStats {
	n := len(tw.samples)
	if n == 0 {
		return TimingStats{}
	}

	// Copy and sort for percentile calculation
	sorted := make([]time.Duration, n)
	copy(sorted, tw.samples)
	sortDurations(sorted)

	var total time.Duration
	for _, d := range sorted {
		total += d
	}

	return TimingStats{
		Count: n,
		Min:   sorted[0],
		Max:   sorted[n-1],
		Avg:   total / time.Duration(n),
		P50:   sorted[n/2],
		P95:   sorted[int(float64(n)*0.95)],
	}
}

// qualityPoint records decision quality at a point in time.
type qualityPoint struct {
	Timestamp   time.Time
	SuccessRate float64
	SampleSize  int
}

// growthPoint records knowledge store size at a point in time.
type growthPoint struct {
	Timestamp time.Time
	Decisions int
	Patterns  int
	GapCount  int
}

// TimingStats summarizes a timing window.
type TimingStats struct {
	Count int           `json:"count"`
	Min   time.Duration `json:"min_ms"`
	Max   time.Duration `json:"max_ms"`
	Avg   time.Duration `json:"avg_ms"`
	P50   time.Duration `json:"p50_ms"`
	P95   time.Duration `json:"p95_ms"`
}

// QualitySnapshot holds a single quality data point.
type QualitySnapshot struct {
	Timestamp   time.Time `json:"timestamp"`
	SuccessRate float64   `json:"success_rate"`
	SampleSize  int       `json:"sample_size"`
}

// GrowthSnapshot holds a single knowledge growth data point.
type GrowthSnapshot struct {
	Timestamp time.Time `json:"timestamp"`
	Decisions int       `json:"decisions"`
	Patterns  int       `json:"patterns"`
	GapCount  int       `json:"gap_count"`
}

// MetricsSnapshot is the complete metrics state returned by Snapshot().
type MetricsSnapshot struct {
	// Per-stage timing stats
	StageTiming map[string]TimingStats `json:"stage_timing"`
	// Per-hook latency stats
	HookLatency map[string]TimingStats `json:"hook_latency"`
	// Decision quality trend (last 50 points)
	DecisionQuality []QualitySnapshot `json:"decision_quality"`
	// Knowledge growth trend (last 50 points)
	KnowledgeGrowth []GrowthSnapshot `json:"knowledge_growth"`
}

// DefaultWindowSize is the rolling window size for timing samples.
const DefaultWindowSize = 100

// MaxQualityPoints caps the quality/growth history length.
const MaxQualityPoints = 50

// New creates a PipelineMetrics with default configuration.
func New() *PipelineMetrics {
	return &PipelineMetrics{
		stageTiming: make(map[string]*timingWindow),
		hookLatency: make(map[string]*timingWindow),
	}
}

// RecordStage records timing for a pipeline stage.
func (pm *PipelineMetrics) RecordStage(stage string, duration time.Duration) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	w := pm.stageTiming[stage]
	if w == nil {
		w = &timingWindow{maxSize: DefaultWindowSize}
		pm.stageTiming[stage] = w
	}
	w.add(duration)
}

// RecordHookLatency records hook execution time.
func (pm *PipelineMetrics) RecordHookLatency(hook string, duration time.Duration) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	w := pm.hookLatency[hook]
	if w == nil {
		w = &timingWindow{maxSize: DefaultWindowSize}
		pm.hookLatency[hook] = w
	}
	w.add(duration)
}

// RecordDecisionQuality appends a quality observation.
func (pm *PipelineMetrics) RecordDecisionQuality(successRate float64, sampleSize int) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if len(pm.decisionQuality) >= MaxQualityPoints {
		pm.decisionQuality = pm.decisionQuality[1:]
	}
	pm.decisionQuality = append(pm.decisionQuality, qualityPoint{
		Timestamp:   time.Now(),
		SuccessRate: successRate,
		SampleSize:  sampleSize,
	})
}

// RecordKnowledgeGrowth appends a knowledge growth observation.
func (pm *PipelineMetrics) RecordKnowledgeGrowth(decisions, patterns, gapCount int) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if len(pm.knowledgeGrowth) >= MaxQualityPoints {
		pm.knowledgeGrowth = pm.knowledgeGrowth[1:]
	}
	pm.knowledgeGrowth = append(pm.knowledgeGrowth, growthPoint{
		Timestamp: time.Now(),
		Decisions: decisions,
		Patterns:  patterns,
		GapCount:  gapCount,
	})
}

// Snapshot returns current metrics for the dashboard.
// All computation happens lazily here — recording is O(1).
func (pm *PipelineMetrics) Snapshot() MetricsSnapshot {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	// Stage timing
	stageStats := make(map[string]TimingStats, len(pm.stageTiming))
	for name, w := range pm.stageTiming {
		stageStats[name] = w.stats()
	}

	// Hook latency
	hookStats := make(map[string]TimingStats, len(pm.hookLatency))
	for name, w := range pm.hookLatency {
		hookStats[name] = w.stats()
	}

	// Decision quality
	quality := make([]QualitySnapshot, len(pm.decisionQuality))
	for i, q := range pm.decisionQuality {
		quality[i] = QualitySnapshot{
			Timestamp:   q.Timestamp,
			SuccessRate: q.SuccessRate,
			SampleSize:  q.SampleSize,
		}
	}

	// Knowledge growth
	growth := make([]GrowthSnapshot, len(pm.knowledgeGrowth))
	for i, g := range pm.knowledgeGrowth {
		growth[i] = GrowthSnapshot{
			Timestamp: g.Timestamp,
			Decisions: g.Decisions,
			Patterns:  g.Patterns,
			GapCount:  g.GapCount,
		}
	}

	return MetricsSnapshot{
		StageTiming:     stageStats,
		HookLatency:     hookStats,
		DecisionQuality: quality,
		KnowledgeGrowth: growth,
	}
}

// sortDurations sorts a slice of durations in ascending order.
func sortDurations(durations []time.Duration) {
	n := len(durations)
	for i := 1; i < n; i++ {
		key := durations[i]
		j := i - 1
		for j >= 0 && durations[j] > key {
			durations[j+1] = durations[j]
			j--
		}
		durations[j+1] = key
	}
}
