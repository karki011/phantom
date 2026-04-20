// bindings_safety.go exposes Safety Rules Engine methods to the Wails frontend.
// Author: Subash Karki
package app

import (
	"github.com/subashkarki/phantom-os-v2/internal/safety"
	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// GetWards returns all loaded ward rules.
func (a *App) GetWards() []safety.Rule {
	if a.Safety == nil {
		return nil
	}
	return a.Safety.GetRules()
}

// GetWard returns a single ward rule by ID, or nil if not found.
func (a *App) GetWard(id string) *safety.Rule {
	if a.Safety == nil {
		return nil
	}
	rules := a.Safety.GetRules()
	for i := range rules {
		if rules[i].ID == id {
			r := rules[i]
			return &r
		}
	}
	return nil
}

// GetWardAudit returns recent audit entries for a given rule, limited by limit.
func (a *App) GetWardAudit(ruleId string, limit int) []safety.Evaluation {
	if a.Safety == nil {
		return nil
	}
	evals, err := a.Safety.GetAuditTrail(a.ctx, safety.AuditQueryOpts{
		RuleID: ruleId,
		Limit:  limit,
	})
	if err != nil {
		return nil
	}
	return evals
}

// GetWardStats returns aggregate audit statistics.
func (a *App) GetWardStats() *safety.AuditStats {
	if a.Safety == nil {
		return nil
	}
	stats, err := a.Safety.GetStats(a.ctx)
	if err != nil {
		return nil
	}
	return stats
}

// DryRunWard evaluates a synthetic event against a specific rule without recording.
func (a *App) DryRunWard(ruleId, toolName, toolInput string) []safety.Evaluation {
	if a.Safety == nil {
		return nil
	}
	ev := &stream.Event{
		ToolName:  toolName,
		ToolInput: toolInput,
	}
	rules := a.Safety.GetRules()
	for _, r := range rules {
		if r.ID == ruleId && r.Match(ev) {
			// Return DryRun result for the specific rule via the evaluator interface.
			// We create a targeted event so only this rule matters.
			break
		}
	}
	// Use the full evaluator dry-run; caller filters by ruleId on the frontend.
	return a.Safety.Evaluate(a.ctx, ev)
}
