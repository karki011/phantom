// evaluator.go implements the rule evaluation engine for the PhantomOS Safety Rules Engine.
// Author: Subash Karki
package safety

import (
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// Evaluation is the result of evaluating a single rule against an event.
type Evaluation struct {
	RuleID    string `json:"rule_id"`
	RuleName  string `json:"rule_name"`
	Level     Level  `json:"level"`
	Message   string `json:"message"`
	Matched   bool   `json:"matched"`
	Timestamp int64  `json:"timestamp"`
	SessionID string `json:"session_id"`
	EventSeq  int    `json:"event_seq"`
	ToolName  string `json:"tool_name"`
	ToolInput string `json:"tool_input"`
	// Outcome: "blocked", "confirmed", "warned", "logged", "bypassed"
	Outcome string `json:"outcome"`
}

// Evaluator checks stream events against the loaded rule set.
type Evaluator struct {
	loader *Loader
}

// NewEvaluator constructs an Evaluator backed by the given Loader.
func NewEvaluator(loader *Loader) *Evaluator {
	return &Evaluator{loader: loader}
}

// Evaluate checks the event against all enabled rules and returns all triggered evaluations.
func (e *Evaluator) Evaluate(ev *stream.Event) []Evaluation {
	return e.evaluate(ev)
}

// DryRun evaluates an event without any side effects. Useful for testing rule configurations.
func (e *Evaluator) DryRun(ev *stream.Event) []Evaluation {
	return e.evaluate(ev)
}

func (e *Evaluator) evaluate(ev *stream.Event) []Evaluation {
	rules := e.loader.Rules()
	now := time.Now().UnixMilli()

	var results []Evaluation
	for _, r := range rules {
		if !r.Match(ev) {
			continue
		}
		outcome := levelToOutcome(r.Level)
		results = append(results, Evaluation{
			RuleID:    r.ID,
			RuleName:  r.Name,
			Level:     r.Level,
			Message:   r.Message,
			Matched:   true,
			Timestamp: now,
			SessionID: ev.SessionID,
			EventSeq:  ev.SeqNum,
			ToolName:  ev.ToolName,
			ToolInput: ev.ToolInput,
			Outcome:   outcome,
		})
	}
	return results
}

// levelToOutcome maps a rule level to its default outcome string.
func levelToOutcome(l Level) string {
	switch l {
	case LevelBlock:
		return "blocked"
	case LevelConfirm:
		return "confirmed"
	case LevelWarn:
		return "warned"
	case LevelLog:
		return "logged"
	default:
		return "logged"
	}
}
