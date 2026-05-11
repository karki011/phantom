// Package strategies provides AI prompt enhancement strategies.
// Assessor evaluates task complexity, risk, and ambiguity from user
// messages and graph context to guide strategy selection.
//
// Author: Subash Karki
package strategies

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"
)

// LLMAssessor is the interface a Haiku-backed assessor must satisfy.
// The narrow interface avoids an import cycle between strategies ↔ assess.
type LLMAssessor interface {
	// Assess returns structured task metadata. Returns (nil, nil) when the LLM
	// is unavailable; callers fall through to keyword-based logic on nil result.
	Assess(ctx context.Context, goal string, projectContext string) (LLMAssessment, error)
}

// LLMAssessment is the normalized output from an LLMAssessor.
type LLMAssessment struct {
	TaskType   string   // feature, bugfix, refactor, debug, exploration, test, docs
	Complexity string   // simple, moderate, complex, critical
	Risk       string   // low, medium, high, critical
	RiskReason string   // human-readable rationale
	KeyFiles   []string // likely files or areas involved
	Summary    string   // one-line task summary
}

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
	haiku   LLMAssessor // optional; when set, Haiku is tried first
}

// NewAssessor creates an Assessor with hardcoded default thresholds.
func NewAssessor() *Assessor { return &Assessor{} }

// SetThresholdTracker attaches an auto-tuning tracker. When set,
// the assessor uses learned thresholds instead of hardcoded defaults.
func (a *Assessor) SetThresholdTracker(t *ThresholdTracker) {
	a.tracker = t
}

// SetLLMAssessor attaches a Haiku-backed LLM assessor. When non-nil it is
// tried first; keyword logic is used as fallback on error or nil result.
func (a *Assessor) SetLLMAssessor(l LLMAssessor) {
	a.haiku = l
}

// Assess evaluates a user message and graph metrics to produce a TaskAssessment.
// When a HaikuAssessor is wired in, it is tried first (2-second timeout). On
// any error or nil result the method falls through to keyword-based logic so
// the pipeline always produces a result.
func (a *Assessor) Assess(message string, fileCount int, blastRadius int) TaskAssessment {
	ambiguity := assessAmbiguity(message)

	// --- Primary path: LLM assessment via Haiku ---
	if a.haiku != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		projectCtx := fmt.Sprintf("~%d context files", fileCount)
		if la, err := a.haiku.Assess(ctx, message, projectCtx); err != nil {
			slog.Warn("haiku assessor error — falling back to keywords", "err", err)
		} else if la.Complexity != "" {
			complexity := complexityFromLLM(la.Complexity, fileCount, a.tracker)
			risk := riskFromLLM(la.Risk, blastRadius, a.tracker)
			slog.Info("haiku assessment applied",
				"complexity", la.Complexity,
				"risk", la.Risk,
				"task_type", la.TaskType,
				"risk_reason", la.RiskReason,
			)
			return TaskAssessment{
				Complexity:     complexity,
				Risk:           risk,
				IsAmbiguous:    ambiguity >= 0.3,
				AmbiguityScore: ambiguity,
				FileCount:      fileCount,
				BlastRadius:    blastRadius,
			}
		}
	}

	// --- Fallback path: keyword-based assessment ---
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

	// When no files are explicitly mentioned, use goal text as a complexity signal.
	if fileCount == 0 {
		complexity = applyGoalTextComplexity(message, complexity)
	}

	// Floor risk based on goal keywords — auth/security/payment work is risky
	// regardless of blast radius.
	risk = applyGoalTextRisk(message, risk)

	return TaskAssessment{
		Complexity:     complexity,
		Risk:           risk,
		IsAmbiguous:    ambiguity >= 0.3,
		AmbiguityScore: ambiguity,
		FileCount:      fileCount,
		BlastRadius:    blastRadius,
	}
}

// complexityFromLLM maps the LLM string to a TaskComplexity, using the graph
// file count as a floor so Haiku can only upgrade — never reduce — what the
// graph signals.
func complexityFromLLM(llmVal string, fileCount int, tracker *ThresholdTracker) TaskComplexity {
	llm := complexityFromString(llmVal)
	var graph TaskComplexity
	if tracker != nil {
		graph = assessComplexityWithConfig(fileCount, tracker.GetConfig())
	} else {
		graph = assessComplexity(fileCount)
	}
	if complexityRankLocal(llm) > complexityRankLocal(graph) {
		return llm
	}
	return graph
}

// riskFromLLM maps the LLM string to a TaskRisk using blast radius as a floor.
func riskFromLLM(llmVal string, blastRadius int, tracker *ThresholdTracker) TaskRisk {
	llm := riskFromString(llmVal)
	var graph TaskRisk
	if tracker != nil {
		graph = assessRiskWithConfig(blastRadius, tracker.GetConfig())
	} else {
		graph = assessRisk(blastRadius)
	}
	if riskRankLocal(llm) > riskRankLocal(graph) {
		return llm
	}
	return graph
}

// complexityFromString converts a lowercase string to TaskComplexity.
func complexityFromString(s string) TaskComplexity {
	switch strings.ToLower(s) {
	case "simple":
		return Simple
	case "moderate":
		return Moderate
	case "complex":
		return Complex
	case "critical":
		return Critical
	}
	return Simple
}

// riskFromString converts a lowercase string to TaskRisk.
func riskFromString(s string) TaskRisk {
	switch strings.ToLower(s) {
	case "low":
		return LowRisk
	case "medium":
		return MediumRisk
	case "high":
		return HighRisk
	case "critical":
		return CriticalRisk
	}
	return LowRisk
}

func complexityRankLocal(c TaskComplexity) int {
	switch c {
	case Simple:
		return 0
	case Moderate:
		return 1
	case Complex:
		return 2
	case Critical:
		return 3
	}
	return 0
}

func riskRankLocal(r TaskRisk) int {
	switch r {
	case LowRisk:
		return 0
	case MediumRisk:
		return 1
	case HighRisk:
		return 2
	case CriticalRisk:
		return 3
	}
	return 0
}

// applyGoalTextComplexity floors complexity based on keywords in the goal text.
// It only upgrades complexity — never downgrades it.
func applyGoalTextComplexity(goal string, complexity TaskComplexity) TaskComplexity {
	goalLower := strings.ToLower(goal)

	// Compound goals with multiple components → complex
	complexKeywords := []string{"refactor", "redesign", "migrate", "implement", "architect", "rewrite", "optimize", "overhaul"}
	hasComplexKeyword := false
	for _, kw := range complexKeywords {
		if strings.Contains(goalLower, kw) {
			hasComplexKeyword = true
			break
		}
	}
	if hasComplexKeyword {
		// "implement X with Y and Z" → complex (multiple components)
		hasCompound := strings.Contains(goalLower, " with ") || strings.Contains(goalLower, " and ")
		if hasCompound && complexity != Critical {
			complexity = Complex
		} else if complexity == Simple {
			complexity = Moderate
		}
		return complexity
	}

	// These keywords suggest meaningful but bounded work.
	moderateKeywords := []string{"add", "create", "build", "feature", "integrate", "update", "fix"}
	if complexity == Simple {
		for _, kw := range moderateKeywords {
			if strings.Contains(goalLower, kw) {
				complexity = Moderate
				break
			}
		}
	}

	return complexity
}

// applyGoalTextRisk floors risk based on security-sensitive keywords.
// Only upgrades risk — never downgrades it.
func applyGoalTextRisk(goal string, risk TaskRisk) TaskRisk {
	goalLower := strings.ToLower(goal)

	highRiskKeywords := []string{"auth", "oauth", "login", "password", "credential", "token", "jwt", "session", "permission", "rbac", "acl", "encrypt", "decrypt", "secret", "api key", "apikey", "certificate", "tls", "ssl"}
	for _, kw := range highRiskKeywords {
		if strings.Contains(goalLower, kw) {
			if risk == LowRisk || risk == MediumRisk {
				return HighRisk
			}
			return risk
		}
	}

	mediumRiskKeywords := []string{"payment", "billing", "credit card", "stripe", "database", "migration", "deploy", "production", "delete", "remove", "drop"}
	for _, kw := range mediumRiskKeywords {
		if strings.Contains(goalLower, kw) {
			if risk == LowRisk {
				return MediumRisk
			}
			return risk
		}
	}

	return risk
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
