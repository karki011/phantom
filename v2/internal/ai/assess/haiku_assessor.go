// Author: Subash Karki
//
// Package assess provides LLM-backed task assessment using Claude Haiku.
// HaikuAssessor replaces brittle keyword matching with actual LLM understanding.
// If Haiku is unavailable or times out, callers fall through to keyword fallback.
package assess

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
)

const haikuAssessTimeout = 8 * time.Second

// HaikuClient is the interface this package needs from knowledge.HaikuClient.
// Kept narrow so tests can inject a fake without importing the concrete type.
type HaikuClient interface {
	Call(ctx context.Context, system, userPrompt string) (text string, inTok, outTok int, err error)
}

// HaikuAssessment is the structured response from Haiku.
type HaikuAssessment struct {
	TaskType   string   `json:"task_type"`   // feature, bugfix, refactor, debug, exploration, test, docs
	Complexity string   `json:"complexity"`  // simple, moderate, complex, critical
	Risk       string   `json:"risk"`        // low, medium, high, critical
	RiskReason string   `json:"risk_reason"` // why this risk level
	KeyFiles   []string `json:"key_files"`   // likely relevant files/areas
	Summary    string   `json:"summary"`     // one-line task summary
}

// HaikuAssessor uses Claude Haiku to assess task complexity and risk.
type HaikuAssessor struct {
	client HaikuClient
}

// NewHaikuAssessor creates a HaikuAssessor. Returns nil when client is nil so
// callers can check for nil and skip to keyword fallback.
func NewHaikuAssessor(client HaikuClient) *HaikuAssessor {
	if client == nil {
		return nil
	}
	return &HaikuAssessor{client: client}
}

// NewHaikuAssessorFromKnowledge is a convenience constructor that accepts the
// concrete *knowledge.HaikuClient so app.go doesn't need to import this package
// just to satisfy the interface.
func NewHaikuAssessorFromKnowledge(client *knowledge.HaikuClient) *HaikuAssessor {
	if client == nil {
		return nil
	}
	return NewHaikuAssessor(client)
}

const assessSystemPrompt = `You are a task assessment engine for a developer workspace. ` +
	`Analyze the given developer task and respond with ONLY a JSON object — no other text, no markdown fences.`

const assessUserTemplate = `Task: "%s"
Project context: %s

Respond with this exact JSON structure:
{
  "task_type": "feature|bugfix|refactor|debug|exploration|test|docs",
  "complexity": "simple|moderate|complex|critical",
  "risk": "low|medium|high|critical",
  "risk_reason": "one sentence explaining the risk level",
  "key_files": ["likely files or areas involved"],
  "summary": "one-line task summary"
}

Guidelines:
- Auth/security/encryption/token/session work = high risk minimum
- Payment/billing/database migration = medium risk minimum
- "implement X with Y and Z" = complex minimum
- Single file change or typo fix = simple
- Refactoring across modules = complex`

// Assess sends the user's goal to Haiku for structured assessment.
// Returns (nil, nil) if Haiku is unavailable; returns (nil, err) on a
// transient error. Callers should fall back to keyword-based assessment on any
// non-nil error or nil result.
func (h *HaikuAssessor) Assess(ctx context.Context, goal string, projectContext string) (*HaikuAssessment, error) {
	if h == nil || h.client == nil {
		return nil, nil
	}

	// Hard 2-second ceiling so a slow Haiku call never blocks the pipeline.
	tctx, cancel := context.WithTimeout(ctx, haikuAssessTimeout)
	defer cancel()

	prompt := fmt.Sprintf(assessUserTemplate, goal, projectContext)

	start := time.Now()
	text, inTok, outTok, err := h.client.Call(tctx, assessSystemPrompt, prompt)
	elapsed := time.Since(start)
	if err != nil {
		slog.Warn("haiku assessment failed, falling back to keywords",
			"error", err, "elapsed_ms", elapsed.Milliseconds())
		return nil, fmt.Errorf("haiku assess call: %w", err)
	}

	result, err := parseAssessment(text)
	if err != nil {
		return nil, fmt.Errorf("haiku assess parse: %w", err)
	}

	slog.Info("haiku assessment",
		"task_type", result.TaskType,
		"complexity", result.Complexity,
		"risk", result.Risk,
		"risk_reason", result.RiskReason,
		"elapsed_ms", elapsed.Milliseconds(),
		"tokens", fmt.Sprintf("%d in / %d out", inTok, outTok),
	)

	return result, nil
}

// parseAssessment extracts a HaikuAssessment from raw Haiku text.
// Tries direct JSON parse first, then strips markdown fences or extracts the
// outermost { … } block — matching the pattern in knowledge.parseConsolidation.
func parseAssessment(text string) (*HaikuAssessment, error) {
	text = strings.TrimSpace(text)

	// Direct parse.
	var a HaikuAssessment
	if err := json.Unmarshal([]byte(text), &a); err == nil {
		if err := validateAssessment(&a); err != nil {
			return nil, err
		}
		return &a, nil
	}

	// Fallback: extract the outermost JSON object.
	extracted := extractJSONObject(text)
	if extracted == "" {
		return nil, fmt.Errorf("no JSON object in haiku response: %q", truncate(text, 120))
	}
	if err := json.Unmarshal([]byte(extracted), &a); err != nil {
		return nil, fmt.Errorf("parse extracted JSON: %w", err)
	}
	if err := validateAssessment(&a); err != nil {
		return nil, err
	}
	return &a, nil
}

// validateAssessment ensures the required enum fields are present and valid.
func validateAssessment(a *HaikuAssessment) error {
	validComplexity := map[string]bool{"simple": true, "moderate": true, "complex": true, "critical": true}
	validRisk := map[string]bool{"low": true, "medium": true, "high": true, "critical": true}

	c := strings.ToLower(a.Complexity)
	if !validComplexity[c] {
		return fmt.Errorf("invalid complexity %q", a.Complexity)
	}
	a.Complexity = c

	r := strings.ToLower(a.Risk)
	if !validRisk[r] {
		return fmt.Errorf("invalid risk %q", a.Risk)
	}
	a.Risk = r

	if a.TaskType == "" {
		return fmt.Errorf("missing task_type")
	}
	a.TaskType = strings.ToLower(a.TaskType)

	return nil
}

// extractJSONObject finds the outermost { … } block in text.
func extractJSONObject(text string) string {
	start := strings.Index(text, "{")
	if start < 0 {
		return ""
	}
	end := strings.LastIndex(text, "}")
	if end <= start {
		return ""
	}
	return text[start : end+1]
}

// truncate limits a string length for safe log output.
func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
