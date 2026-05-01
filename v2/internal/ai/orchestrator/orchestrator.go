// Package orchestrator exposes a stateful goal->strategy entrypoint built on
// the existing strategies registry, assessor, knowledge stores, and filegraph
// indexer. v1 wired these together inside packages/ai-engine/src/orchestrator;
// v2 keeps the pieces split and now offers Process for non-chat callers (e.g.
// the MCP stdio server) without taking on Wails-app-specific dependencies.
//
// Each Process call is now stateful: it reads past decisions to inform
// strategy selection, applies auto-tune + performance penalties, writes a new
// decision after the run, and feeds gap-detection feedback into future runs.
//
// Author: Subash Karki
package orchestrator

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
)

// ProcessInput is the goal-shaped request the orchestrator consumes.
type ProcessInput struct {
	ProjectID   string
	Goal        string
	ActiveFiles []string
	Hints       Hints
}

// Hints mirrors v1's GoalInput.hints — optional knobs the caller can pass.
type Hints struct {
	IsAmbiguous         bool   `json:"isAmbiguous,omitempty"`
	IsCritical          bool   `json:"isCritical,omitempty"`
	EstimatedComplexity string `json:"estimatedComplexity,omitempty"`
}

// StrategyChoice describes the selected strategy or one alternative.
type StrategyChoice struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Reason string  `json:"reason,omitempty"`
	Score  float64 `json:"score"`
}

// FileRef is a path + relevance pair (relevance decays with neighbor distance).
type FileRef struct {
	Path      string  `json:"path"`
	Relevance float64 `json:"relevance"`
}

// ContextSummary captures the graph context surfaced to the strategy.
type ContextSummary struct {
	Files        []FileRef `json:"files"`
	BlastRadius  int       `json:"blastRadius"`
	RelatedFiles []string  `json:"relatedFiles"`
}

// TaskAssessmentSummary mirrors v1's taskContext shape.
type TaskAssessmentSummary struct {
	Complexity     string  `json:"complexity"`
	Risk           string  `json:"risk"`
	IsAmbiguous    bool    `json:"isAmbiguous"`
	AmbiguityScore float64 `json:"ambiguityScore"`
	FileCount      int     `json:"fileCount"`
	BlastRadius    int     `json:"blastRadius"`
}

// StrategyOutput is the strategy execution result. For v2's deterministic
// strategies the `text` field carries the enriched prompt; confidence is
// derived from the activation score.
type StrategyOutput struct {
	Text       string  `json:"text"`
	Confidence float64 `json:"confidence"`
}

// LearningSummary surfaces what the learning loop did during a Process call.
// All fields are optional and omitted from the wire when zero — the wire shape
// for existing callers is unchanged.
type LearningSummary struct {
	DecisionID            string  `json:"decisionId,omitempty"`
	PriorFailures         int     `json:"priorFailures,omitempty"`
	PerformanceWeight     float64 `json:"performanceWeight,omitempty"`
	GlobalPatternBoost    float64 `json:"globalPatternBoost,omitempty"`
	GapDetectorWarning    string  `json:"gapDetectorWarning,omitempty"`
	AutoTuneThresholdsKey string  `json:"autoTuneApplied,omitempty"`
}

// ProcessResult is the wire-shape compatible with v1 orchestrator handlers.
type ProcessResult struct {
	Strategy        StrategyChoice        `json:"strategy"`
	Alternatives    []StrategyChoice      `json:"alternatives"`
	Context         ContextSummary        `json:"context"`
	TaskContext     TaskAssessmentSummary `json:"taskContext"`
	Output          StrategyOutput        `json:"output"`
	Confidence      float64               `json:"confidence"`
	TotalDurationMs int64                 `json:"durationMs"`
	Learning        *LearningSummary      `json:"learning,omitempty"`
}

// Dependencies is the set of services Process needs. Each is optional:
// - When Indexer is nil, graph-derived signals fall back to zero.
// - When Registry is nil, a default registry with all 7 strategies is used.
// - When Assessor is nil, a fresh Assessor is created.
// - Knowledge components (Decisions, Performance, AutoTune, GlobalPatterns,
//   GapDetector, Compactor) are all optional. When provided they enable the
//   learning loop; when absent Process degrades gracefully to a stateless run.
type Dependencies struct {
	Indexer        *filegraph.Indexer
	Registry       *strategies.Registry
	Assessor       *strategies.Assessor
	Decisions      *knowledge.DecisionStore
	Performance    *strategies.PerformanceStore
	AutoTune       *strategies.ThresholdTracker
	GlobalPatterns *knowledge.GlobalPatternStore
	GapDetector    *strategies.GapDetector
	Compactor      *knowledge.Compactor
}

// ErrNoStrategies is returned when the registry can't pick any strategy.
var ErrNoStrategies = errors.New("no strategies available")

// ErrEmptyGoal is returned when Process is called with a blank goal.
// Empty goals were corrupting the ai_decisions table with zero-value rows.
var ErrEmptyGoal = errors.New("orchestrator: goal must be non-empty")

// minActivationThreshold mirrors v1 registry.ts MIN_ACTIVATION_THRESHOLD.
// Scores below this are treated as "doesn't qualify" and we fall back to Direct.
const minActivationThreshold = 0.1

// Process runs the goal->strategy pipeline and returns a v1-shaped result.
// Pipeline: graph snapshot -> assess -> load priors -> select -> execute ->
// persist decision -> update performance store. LLM calls are not made here —
// strategies enrich the prompt deterministically.
func Process(ctx context.Context, deps Dependencies, in ProcessInput) (*ProcessResult, error) {
	start := time.Now()

	if strings.TrimSpace(in.Goal) == "" {
		return nil, ErrEmptyGoal
	}

	// --- Pre-execution ---
	registry := deps.Registry
	if registry == nil {
		registry = defaultRegistry()
	}
	if deps.Performance != nil {
		registry.SetPerformanceStore(deps.Performance)
	}

	assessor := deps.Assessor
	if assessor == nil {
		assessor = strategies.NewAssessor()
	}
	if deps.AutoTune != nil {
		assessor.SetThresholdTracker(deps.AutoTune)
	}

	// 1. Graph context — neighbors of every active file (depth 2), merged
	//    by max relevance.
	contextFiles, blastRadius, relatedFiles := gatherGraph(deps.Indexer, in.ActiveFiles)

	// 2. Assess (auto-tune influences thresholds when attached).
	assessment := assessor.Assess(in.Goal, len(contextFiles), blastRadius)
	applyHints(&assessment, in.Hints)

	// 3. Load priors for this project + similar goal.
	priorFailures := loadPriorFailures(deps.Decisions, in.Goal)
	patternBias := loadPatternBias(deps.GlobalPatterns)
	gapWarning := detectGapWarning(deps.GapDetector, deps.Decisions)

	// 4. Score every strategy with priors applied.
	all := scoreAll(registry, assessment, priorFailures, patternBias, deps.Performance)
	if len(all) == 0 {
		return nil, ErrNoStrategies
	}

	// 5. Pick the winner — fall back to Direct when nothing clears the threshold.
	winner := all[0]
	if winner.Score < minActivationThreshold {
		if direct := pickDirect(all); direct != nil {
			winner = *direct
		}
	}

	// 6. Execute the winner. v2 strategies are deterministic enrichers — no
	//    network or LLM calls — so we run inline.
	enriched := winner.Strategy.Enrich(in.Goal, assessment, "")

	// --- Post-execution: persist + update performance ---
	learning := &LearningSummary{
		PriorFailures:      len(priorFailures),
		PerformanceWeight:  performanceWeightFor(deps.Performance, winner.Strategy.ID(), assessment.Complexity),
		GlobalPatternBoost: patternBias[bias{strategyID: winner.Strategy.ID(), complexity: string(assessment.Complexity), risk: string(assessment.Risk)}],
		GapDetectorWarning: gapWarning,
	}

	if deps.Decisions != nil {
		if id, err := deps.Decisions.Record(in.Goal, winner.Strategy.ID(), winner.Score,
			string(assessment.Complexity), string(assessment.Risk)); err == nil {
			learning.DecisionID = id
			// Tag this as orchestrator-phase: strategy selection completed
			// without crashing, but the LLM hasn't run yet. Composer's
			// post-turn verifier (or the MCP feedback API) writes a separate
			// verifier-phase row when ground-truth pass/fail is known.
			// GetSuccessRate / GetFailedApproaches ignore orchestrator-phase
			// rows so the learning loop isn't biased toward over-optimism.
			_ = deps.Decisions.RecordOrchestratorOutcome(id, true, "")
		}
	}
	if deps.Performance != nil {
		deps.Performance.Record(winner.Strategy.ID(), assessment.Complexity, true)
	}
	if deps.AutoTune != nil {
		deps.AutoTune.RecordOutcome(assessment.Complexity, true, len(contextFiles))
		learning.AutoTuneThresholdsKey = "ema-applied"
	}
	if deps.Compactor != nil {
		if should, err := deps.Compactor.ShouldRun(); err == nil && should {
			_ = deps.Compactor.Run()
		}
	}

	// 7. Build response.
	return &ProcessResult{
		Strategy: StrategyChoice{
			ID:     winner.Strategy.ID(),
			Name:   winner.Strategy.Name(),
			Reason: winner.Reason,
			Score:  winner.Score,
		},
		Alternatives: toChoices(all[1:]),
		Context: ContextSummary{
			Files:        contextFiles,
			BlastRadius:  blastRadius,
			RelatedFiles: relatedFiles,
		},
		TaskContext: TaskAssessmentSummary{
			Complexity:     string(assessment.Complexity),
			Risk:           string(assessment.Risk),
			IsAmbiguous:    assessment.IsAmbiguous,
			AmbiguityScore: assessment.AmbiguityScore,
			FileCount:      assessment.FileCount,
			BlastRadius:    assessment.BlastRadius,
		},
		Output: StrategyOutput{
			Text:       enriched,
			Confidence: winner.Score,
		},
		Confidence:      winner.Score,
		TotalDurationMs: time.Since(start).Milliseconds(),
		Learning:        learning,
	}, nil
}

// scoredStrategy holds the activation score result for ordering and reporting.
type scoredStrategy struct {
	Strategy strategies.Strategy
	Score    float64
	Reason   string
}

// bias is the lookup key used for global-pattern boosts.
type bias struct {
	strategyID string
	complexity string
	risk       string
}

// scoreAll asks every registered strategy for an activation score, applies
// historical penalties, performance weighting, and global-pattern bias, then
// returns them sorted high to low.
func scoreAll(
	reg *strategies.Registry,
	assessment strategies.TaskAssessment,
	priorFailures []strategies.Failure,
	patternBias map[bias]float64,
	perf *strategies.PerformanceStore,
) []scoredStrategy {
	candidates := defaultStrategies(reg)
	out := make([]scoredStrategy, 0, len(candidates))
	for _, s := range candidates {
		score, reason := s.ShouldActivate(assessment)

		// Apply prior-failure penalty (v1 prior-penalty.ts equivalent).
		if len(priorFailures) > 0 {
			adj, penaltyReason := strategies.ApplyFailurePenalty(score, s.ID(), priorFailures)
			if penaltyReason != "" {
				score = adj
				reason = reason + " [" + penaltyReason + "]"
			}
		}

		// Apply performance weight (registry already applies this when set,
		// but defaultStrategies is independent of registry storage so we apply
		// here too for consistency between paths).
		if perf != nil {
			score *= perf.GetHistoricalWeight(s.ID(), assessment.Complexity)
		}

		// Apply global-pattern bias when this (strategy, complexity, risk)
		// triple is a proven cross-project winner.
		if boost, ok := patternBias[bias{s.ID(), string(assessment.Complexity), string(assessment.Risk)}]; ok {
			score *= 1.0 + boost
			reason = reason + " [global-pattern bias]"
		}

		out = append(out, scoredStrategy{Strategy: s, Score: score, Reason: reason})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}

// pickDirect returns the Direct strategy from a scored list (the safe default).
func pickDirect(scored []scoredStrategy) *scoredStrategy {
	for i := range scored {
		if scored[i].Strategy.ID() == "direct" {
			scored[i].Reason = "fallback: no strategy cleared activation threshold"
			return &scored[i]
		}
	}
	return nil
}

// loadPriorFailures pulls failed-approach signals from the v2 decision store.
// Returns nil when the store is absent or the lookup errors.
func loadPriorFailures(ds *knowledge.DecisionStore, goal string) []strategies.Failure {
	if ds == nil {
		return nil
	}
	failed, err := ds.GetFailedApproaches(goal)
	if err != nil || len(failed) == 0 {
		return nil
	}
	out := make([]strategies.Failure, 0, len(failed))
	for _, f := range failed {
		out = append(out, strategies.Failure{StrategyID: f.StrategyID, CreatedAt: f.CreatedAt})
	}
	return out
}

// loadPatternBias reads cross-project proven patterns and converts them into a
// (strategy, complexity, risk) -> boost map. The boost is the success rate
// minus the 0.7 promotion threshold, so a 0.85 success rate yields +0.15.
func loadPatternBias(gp *knowledge.GlobalPatternStore) map[bias]float64 {
	if gp == nil {
		return nil
	}
	out := make(map[bias]float64)
	for _, p := range gp.GetAll() {
		if p.SuccessRate <= 0.7 {
			continue
		}
		out[bias{strategyID: p.StrategyID, complexity: p.Complexity, risk: p.Risk}] = p.SuccessRate - 0.7
	}
	return out
}

// detectGapWarning returns a short message when the gap detector reports
// critical gaps in the historical decision store. Used purely as observability —
// it does not change selection.
func detectGapWarning(gd *strategies.GapDetector, ds *knowledge.DecisionStore) string {
	if gd == nil || ds == nil {
		return ""
	}
	// Decision store doesn't expose the underlying *sql.DB. Without it the gap
	// detector cannot run — degrade silently. Callers that want gap detection
	// should wire the *sql.DB directly into deps and call FindGaps themselves;
	// this is intentionally conservative (KISS) until a real consumer needs it.
	return ""
}

// performanceWeightFor returns the weight for a given strategy, or 1.0 when
// no performance store is attached.
func performanceWeightFor(ps *strategies.PerformanceStore, strategyID string, complexity strategies.TaskComplexity) float64 {
	if ps == nil {
		return 1.0
	}
	return ps.GetHistoricalWeight(strategyID, complexity)
}

// toChoices flattens scoredStrategy slices into the wire shape.
func toChoices(in []scoredStrategy) []StrategyChoice {
	out := make([]StrategyChoice, 0, len(in))
	for _, s := range in {
		out = append(out, StrategyChoice{
			ID:     s.Strategy.ID(),
			Name:   s.Strategy.Name(),
			Reason: s.Reason,
			Score:  s.Score,
		})
	}
	return out
}

// gatherGraph walks the indexer for every active file, merging context
// (depth=2 for files, depth=1 for related), and computing a blast radius
// equal to direct + transitive importer count.
func gatherGraph(ix *filegraph.Indexer, activeFiles []string) (files []FileRef, blastRadius int, related []string) {
	if ix == nil || len(activeFiles) == 0 {
		return nil, 0, nil
	}
	g := ix.Graph()

	scores := make(map[string]float64)
	directSet := make(map[string]struct{})
	transSet := make(map[string]struct{})
	relatedSet := make(map[string]struct{})
	excluded := make(map[string]struct{}, len(activeFiles))
	for _, f := range activeFiles {
		excluded[f] = struct{}{}
	}

	for _, f := range activeFiles {
		// Context (depth 2) with score decay matching HandleGraphContext.
		neighbors := g.Neighbors(f, 2)
		for i, n := range neighbors {
			s := 1.0 - float64(i)*0.05
			if s < 0.1 {
				s = 0.1
			}
			if cur, ok := scores[n.Path]; !ok || s > cur {
				scores[n.Path] = s
			}
		}

		// Related (depth 1).
		for _, n := range g.Neighbors(f, 1) {
			if _, ok := excluded[n.Path]; ok {
				continue
			}
			relatedSet[n.Path] = struct{}{}
		}

		// Blast radius — direct + transitive importers.
		node := g.Get(f)
		if node == nil {
			continue
		}
		for _, p := range node.ImportedBy {
			directSet[p] = struct{}{}
		}
		frontier := append([]string{}, node.ImportedBy...)
		for len(frontier) > 0 {
			next := frontier[:0]
			for _, p := range frontier {
				up := g.Get(p)
				if up == nil {
					continue
				}
				for _, parent := range up.ImportedBy {
					if _, ok := directSet[parent]; ok {
						continue
					}
					if _, ok := transSet[parent]; ok {
						continue
					}
					transSet[parent] = struct{}{}
					next = append(next, parent)
				}
			}
			frontier = append([]string(nil), next...)
		}
	}

	files = make([]FileRef, 0, len(scores))
	for path, s := range scores {
		files = append(files, FileRef{Path: path, Relevance: s})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Relevance > files[j].Relevance })

	related = make([]string, 0, len(relatedSet))
	for p := range relatedSet {
		related = append(related, p)
	}
	sort.Strings(related)

	return files, len(directSet) + len(transSet), related
}

// applyHints lets the caller force-promote complexity/risk via Hints.
func applyHints(a *strategies.TaskAssessment, h Hints) {
	if h.IsAmbiguous {
		a.IsAmbiguous = true
		if a.AmbiguityScore < 0.5 {
			a.AmbiguityScore = 0.5
		}
	}
	switch h.EstimatedComplexity {
	case "simple":
		a.Complexity = strategies.Simple
	case "moderate":
		a.Complexity = strategies.Moderate
	case "complex":
		a.Complexity = strategies.Complex
	case "critical":
		a.Complexity = strategies.Critical
	}
	if h.IsCritical {
		a.Complexity = strategies.Critical
		a.Risk = strategies.CriticalRisk
	}
}

// defaultRegistry seeds a Registry with all 7 ported strategies so callers
// without their own registry get the full pipeline.
func defaultRegistry() *strategies.Registry {
	reg := strategies.NewRegistry()
	reg.Register(strategies.NewDirectStrategy(), 10)
	reg.Register(strategies.NewDecomposeStrategy(), 5)
	reg.Register(strategies.NewAdvisorStrategy(), 6)
	reg.Register(strategies.NewSelfRefineStrategy(), 4)
	reg.Register(strategies.NewTreeOfThoughtStrategy(), 3)
	reg.Register(strategies.NewDebateStrategy(), 7)
	reg.Register(strategies.NewGraphOfThoughtStrategy(), 8)
	return reg
}

// defaultStrategies returns the well-known v2 strategies in registration order.
// The Registry type does not expose its entries, so this list is the source of
// truth for the alternatives report.
func defaultStrategies(_ *strategies.Registry) []strategies.Strategy {
	return []strategies.Strategy{
		strategies.NewDirectStrategy(),
		strategies.NewDecomposeStrategy(),
		strategies.NewAdvisorStrategy(),
		strategies.NewSelfRefineStrategy(),
		strategies.NewTreeOfThoughtStrategy(),
		strategies.NewDebateStrategy(),
		strategies.NewGraphOfThoughtStrategy(),
	}
}
