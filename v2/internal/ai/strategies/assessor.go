// Package strategies provides AI prompt enhancement strategies.
// Assessor evaluates task complexity, risk, and ambiguity from user
// messages and graph context to guide strategy selection.
//
// Author: Subash Karki
package strategies

import (
	"regexp"
	"strings"
)

// TaskComplexity indicates how involved a task is based on file count.
type TaskComplexity string

// TaskRisk indicates the potential blast radius of a change.
type TaskRisk string

const (
	Simple   TaskComplexity = "simple"
	Moderate TaskComplexity = "moderate"
	Complex  TaskComplexity = "complex"
	Critical TaskComplexity = "critical"

	LowRisk      TaskRisk = "low"
	MediumRisk   TaskRisk = "medium"
	HighRisk     TaskRisk = "high"
	CriticalRisk TaskRisk = "critical"
)

// TaskAssessment holds the result of evaluating a task's characteristics.
type TaskAssessment struct {
	Complexity     TaskComplexity
	Risk           TaskRisk
	IsAmbiguous    bool
	AmbiguityScore float64
	FileCount      int
	BlastRadius    int
}

// Assessor evaluates tasks to produce a TaskAssessment.
type Assessor struct {
	tracker *ThresholdTracker
}

// NewAssessor creates an Assessor with hardcoded default thresholds.
func NewAssessor() *Assessor { return &Assessor{} }

// SetThresholdTracker attaches an auto-tuning tracker. When set,
// the assessor uses learned thresholds instead of hardcoded defaults.
func (a *Assessor) SetThresholdTracker(t *ThresholdTracker) {
	a.tracker = t
}

// Assess evaluates a user message and graph metrics to produce a TaskAssessment.
func (a *Assessor) Assess(message string, fileCount int, blastRadius int) TaskAssessment {
	ambiguity := assessAmbiguity(message)

	var complexity TaskComplexity
	var risk TaskRisk

	if a.tracker != nil {
		cfg := a.tracker.GetConfig()
		complexity = assessComplexityWithConfig(fileCount, cfg)
		risk = assessRiskWithConfig(blastRadius, cfg)
	} else {
		complexity = assessComplexity(fileCount)
		risk = assessRisk(blastRadius)
	}

	return TaskAssessment{
		Complexity:     complexity,
		Risk:           risk,
		IsAmbiguous:    ambiguity >= 0.3,
		AmbiguityScore: ambiguity,
		FileCount:      fileCount,
		BlastRadius:    blastRadius,
	}
}

// assessComplexity maps file count to a complexity tier using hardcoded defaults.
func assessComplexity(fileCount int) TaskComplexity {
	return assessComplexityWithConfig(fileCount, DefaultThresholds())
}

// assessComplexityWithConfig maps file count using the provided thresholds.
func assessComplexityWithConfig(fileCount int, cfg ThresholdConfig) TaskComplexity {
	switch {
	case fileCount <= cfg.SimpleMaxFiles:
		return Simple
	case fileCount <= cfg.ModerateMaxFiles:
		return Moderate
	case fileCount <= cfg.ComplexMaxFiles:
		return Complex
	default:
		return Critical
	}
}

// assessRisk maps blast radius to a risk tier using hardcoded defaults.
func assessRisk(blastRadius int) TaskRisk {
	return assessRiskWithConfig(blastRadius, DefaultThresholds())
}

// assessRiskWithConfig maps blast radius using the provided thresholds.
func assessRiskWithConfig(blastRadius int, cfg ThresholdConfig) TaskRisk {
	switch {
	case blastRadius <= cfg.LowRiskMax:
		return LowRisk
	case blastRadius <= cfg.MediumRiskMax:
		return MediumRisk
	case blastRadius <= cfg.HighRiskMax:
		return HighRisk
	default:
		return CriticalRisk
	}
}

// ambiguitySignal pairs a regex pattern with a weight for ambiguity scoring.
type ambiguitySignal struct {
	pattern *regexp.Regexp
	weight  float64
}

// ambiguitySignals are compiled once and reused across calls.
var ambiguitySignals = []ambiguitySignal{
	{regexp.MustCompile(`\?`), 0.3},
	{regexp.MustCompile(`(?i)\b(should|maybe|perhaps|might|could|consider)\b`), 0.2},
	{regexp.MustCompile(`(?i)\b(or)\b.*\b(vs|versus|alternative)\b`), 0.25},
	{regexp.MustCompile(`(?i)\b(not sure|unclear|uncertain|don't know)\b`), 0.4},
	{regexp.MustCompile(`(?i)\b(which)\b.*\b(better)\b|\b(what approach)\b|\b(how should)\b`), 0.35},
}

// assessAmbiguity scores how ambiguous a user message is (0.0 – 1.5 range).
func assessAmbiguity(message string) float64 {
	score := 0.0
	lower := strings.ToLower(message)
	for _, s := range ambiguitySignals {
		if s.pattern.MatchString(lower) {
			score += s.weight
		}
	}
	return score
}
