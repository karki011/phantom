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
	"strconv"
	"strings"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/detect"
	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
	"github.com/subashkarki/phantom-os-v2/internal/conflict"
)

// ProcessInput is the goal-shaped request the orchestrator consumes.
type ProcessInput struct {
	ProjectID   string
	Goal        string
	CWD         string // repo working directory — used for conflict detection
	ActiveFiles []string
	Hints       Hints
	// TaskType carries the self-classified work type from a prior turn's
	// <phantom:task_type> extraction (e.g. "feature", "bugfix", "refactor").
	// When non-empty it is used as a soft signal to bump strategy scores
	// before selection — it never overrides graph or assessor signals.
	TaskType    string
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
	ConflictSessionCount  int     `json:"conflictSessions,omitempty"`
	ConflictRiskBoost     float64 `json:"conflictRiskBoost,omitempty"`
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
// - DetectorCoordinator is optional. When set, its hints augment the assessor
//   result before strategy selection (additive — existing logic unchanged).
type Dependencies struct {
	Indexer              *filegraph.Indexer
	Registry             *strategies.Registry
	Assessor             *strategies.Assessor
	Decisions            *knowledge.DecisionStore
	Performance          *strategies.PerformanceStore
	AutoTune             *strategies.ThresholdTracker
	GlobalPatterns       *knowledge.GlobalPatternStore
	GapDetector          *strategies.GapDetector
	Compactor            *knowledge.Compactor
	ConflictTracker      *conflict.Tracker        // optional — enables multi-session awareness
	DetectorCoordinator  *detect.Coordinator      // optional — enriches context before strategy selection
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

	// 2b. Run the detector pipeline when one is wired in. The resulting hints
	// are additive: they can promote complexity/risk but never demote them
	// below what the assessor already determined. This preserves the existing
	// assessment logic while layering richer context on top.
	if deps.DetectorCoordinator != nil {
		dinput := &detect.DetectorInput{
			Goal:    in.Goal,
			Files:   in.ActiveFiles,
			WorkDir: in.CWD,
		}
		if dhints, err := deps.DetectorCoordinator.Analyze(ctx, dinput); err == nil {
			applyDetectorHints(&assessment, dhints)
		}
		// Detector errors are non-fatal — assessment already contains a baseline.
	}

	// 3. Load priors for this project + similar goal.
	priorFailures := loadPriorFailures(deps.Decisions, in.Goal)
	patternBias := loadPatternBias(deps.GlobalPatterns)
	gapWarning := detectGapWarning(deps.GapDetector, deps.Decisions)

	// 3b. Check for active conflicts in this repo. When multiple sessions
	// target the same repository, we boost risk to bias strategy selection
	// toward more conservative approaches (fewer concurrent edits = fewer
	// merge conflicts downstream).
	var conflictSessionCount int
	var conflictRiskBoost float64
	if deps.ConflictTracker != nil && in.CWD != "" {
		conflictSessionCount = deps.ConflictTracker.ActiveSessionCount(in.CWD)
		if conflictSessionCount > 1 { // more than just this session
			conflictRiskBoost = 0.15 * float64(conflictSessionCount-1)
			// Cap at 0.6 so even heavy contention can't zero-out scores.
			if conflictRiskBoost > 0.6 {
				conflictRiskBoost = 0.6
			}
		}
	}

	// 4. Score every strategy with priors applied.
	all := scoreAll(registry, assessment, priorFailures, patternBias, deps.Performance)
	if len(all) == 0 {
		return nil, ErrNoStrategies
	}

	// 4c. Apply task-type bias — soft bump based on self-classified work type
	// from the previous turn. This is additive and conservative: a +0.1 nudge
	// on preferred strategies and a -0.05 nudge on non-preferred ones.
	// Never zeroes out a strategy; graph and assessor signals take priority.
	if in.TaskType != "" {
		applyTaskTypeBias(all, in.TaskType)
		sort.SliceStable(all, func(i, j int) bool { return all[i].Score > all[j].Score })
	}

	// 4b. Apply conflict-risk penalty — reduce all strategy scores uniformly.
	// This makes the orchestrator prefer conservative strategies (like Direct)
	// when other sessions are actively editing the same repo.
	if conflictRiskBoost > 0 {
		penalty := 1.0 - conflictRiskBoost
		for i := range all {
			all[i].Score *= penalty
			if conflictSessionCount > 1 {
				all[i].Reason += " [conflict-risk: " +
					strconv.Itoa(conflictSessionCount-1) + " other session(s)]"
			}
		}
		// Re-sort after penalty — Direct (which was already high) may now rank
		// higher relative to riskier strategies that had small activation margins.
		sort.SliceStable(all, func(i, j int) bool { return all[i].Score > all[j].Score })
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
		PriorFailures:        len(priorFailures),
		PerformanceWeight:    performanceWeightFor(deps.Performance, winner.Strategy.ID(), assessment.Complexity),
		GlobalPatternBoost:   patternBias[bias{strategyID: winner.Strategy.ID(), complexity: string(assessment.Complexity), risk: string(assessment.Risk)}],
		GapDetectorWarning:   gapWarning,
		ConflictSessionCount: conflictSessionCount,
		ConflictRiskBoost:    conflictRiskBoost,
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

// applyDetectorHints promotes complexity and risk based on detector pipeline
// output. Promotions are one-way (only upward) so the detector can never
// *reduce* what the base assessor already determined from graph metrics.
// High-confidence hints (>= 0.7) drive promotions; lower-confidence hints are
// ignored to avoid noisy signals overriding graph-backed signals.
func applyDetectorHints(a *strategies.TaskAssessment, hints []detect.Hint) {
	const minConf = 0.7
	for _, h := range hints {
		if h.Confidence < minConf {
			continue
		}
		switch h.Key {
		case "complexity":
			promoted := complexityFromString(h.Value)
			if complexityRank(promoted) > complexityRank(a.Complexity) {
				a.Complexity = promoted
			}
		case "risk":
			promoted := riskFromString(h.Value)
			if riskRank(promoted) > riskRank(a.Risk) {
				a.Risk = promoted
			}
		}
	}
}

// complexityFromString converts a detector hint value to a TaskComplexity.
func complexityFromString(s string) strategies.TaskComplexity {
	switch strings.ToLower(s) {
	case "low", "simple":
		return strategies.Simple
	case "medium", "moderate":
		return strategies.Moderate
	case "high", "complex":
		return strategies.Complex
	case "critical":
		return strategies.Critical
	}
	return strategies.Simple
}

// riskFromString converts a detector hint value to a TaskRisk.
func riskFromString(s string) strategies.TaskRisk {
	switch strings.ToLower(s) {
	case "low":
		return strategies.LowRisk
	case "medium":
		return strategies.MediumRisk
	case "high":
		return strategies.HighRisk
	case "critical":
		return strategies.CriticalRisk
	}
	return strategies.LowRisk
}

// complexityRank maps TaskComplexity to an integer for comparison.
func complexityRank(c strategies.TaskComplexity) int {
	switch c {
	case strategies.Simple:
		return 0
	case strategies.Moderate:
		return 1
	case strategies.Complex:
		return 2
	case strategies.Critical:
		return 3
	}
	return 0
}

// riskRank maps TaskRisk to an integer for comparison.
func riskRank(r strategies.TaskRisk) int {
	switch r {
	case strategies.LowRisk:
		return 0
	case strategies.MediumRisk:
		return 1
	case strategies.HighRisk:
		return 2
	case strategies.CriticalRisk:
		return 3
	}
	return 0
}

// applyTaskTypeBias nudges strategy scores based on the self-classified task
// type from the prior turn. Preferred strategies get +0.10; the rest get -0.05.
// These are soft signals — existing graph/assessor scores always dominate.
//
// Mapping (mirrors task description):
//
//	feature, refactor  → prefer tree-of-thought, decompose (complex thinking)
//	bugfix, debug      → prefer self-refine, direct (tight feedback loop)
//	exploration, docs  → prefer direct, advisor (answer-oriented)
//	test               → prefer direct
func applyTaskTypeBias(all []scoredStrategy, taskType string) {
	const bump = 0.10
	const damp = 0.05

	// preferred holds strategy IDs that get a positive nudge.
	var preferred map[string]bool
	switch strings.ToLower(taskType) {
	case "feature", "refactor":
		preferred = map[string]bool{"tree-of-thought": true, "decompose": true}
	case "bugfix", "debug":
		preferred = map[string]bool{"self-refine": true, "direct": true}
	case "exploration", "docs":
		preferred = map[string]bool{"direct": true, "advisor": true}
	case "test":
		preferred = map[string]bool{"direct": true}
	default:
		return // unknown task type — no adjustment
	}

	for i := range all {
		id := all[i].Strategy.ID()
		if preferred[id] {
			all[i].Score += bump
			all[i].Reason += " [task-type:" + taskType + "+]"
		} else {
			if all[i].Score > damp {
				all[i].Score -= damp
			}
			all[i].Reason += " [task-type:" + taskType + "-]"
		}
	}
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
