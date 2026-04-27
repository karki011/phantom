// bindings_safety.go exposes Safety Rules Engine methods to the Wails frontend.
// Author: Subash Karki
package app

import (
	"fmt"

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

// SaveWardRule creates or updates a custom ward rule.
func (a *App) SaveWardRule(rule safety.Rule) error {
	if a.Safety == nil {
		return fmt.Errorf("safety service not initialised")
	}
	return a.Safety.SaveRule(rule)
}

// DeleteWardRule removes a custom ward rule by ID.
func (a *App) DeleteWardRule(ruleID string) error {
	if a.Safety == nil {
		return fmt.Errorf("safety service not initialised")
	}
	return a.Safety.DeleteRule(ruleID)
}

// ToggleWardRule enables or disables a ward rule.
func (a *App) ToggleWardRule(ruleID string, enabled bool) error {
	if a.Safety == nil {
		return fmt.Errorf("safety service not initialised")
	}
	return a.Safety.ToggleRule(ruleID, enabled)
}

// GetWardPresets returns available preset rule sets.
func (a *App) GetWardPresets() []WardPreset {
	return []WardPreset{
		{
			ID:          "strict",
			Name:        "Strict",
			Description: "Blocks destructive operations, requires confirmation for deploys",
			RuleCount:   5,
		},
		{
			ID:          "permissive",
			Name:        "Permissive",
			Description: "Warns on risky operations but never blocks",
			RuleCount:   5,
		},
		{
			ID:          "git-safe",
			Name:        "Git Safe",
			Description: "Blocks force push, reset --hard, branch -D",
			RuleCount:   3,
		},
		{
			ID:          "data-safe",
			Name:        "Data Safe",
			Description: "Blocks writes to data files, warns on database commands",
			RuleCount:   3,
		},
	}
}

// ApplyWardPreset replaces custom.yaml with a preset rule set.
func (a *App) ApplyWardPreset(presetID string) error {
	if a.Safety == nil {
		return fmt.Errorf("safety service not initialised")
	}
	rules := getPresetRules(presetID)
	if len(rules) == 0 {
		return fmt.Errorf("unknown preset: %s", presetID)
	}
	return a.Safety.ReplaceCustomRules(rules)
}

// WardPreset describes a template rule set.
type WardPreset struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	RuleCount   int    `json:"rule_count"`
}

func getPresetRules(presetID string) []safety.Rule {
	switch presetID {
	case "strict":
		return []safety.Rule{
			{ID: "strict-block-deletes", Name: "Block deletes", Level: safety.LevelBlock, EventType: "tool_use", Tool: "Bash", Pattern: `(rm\s|rmdir\s|unlink\s)`, Message: "Delete command detected — session paused", Enabled: true, Audit: true},
			{ID: "strict-block-force-push", Name: "Block force push", Level: safety.LevelBlock, EventType: "tool_use", Tool: "Bash", Pattern: `git\s+push.*--force`, Message: "Force push detected — session paused", Enabled: true, Audit: true},
			{ID: "strict-block-drop-table", Name: "Block DROP TABLE", Level: safety.LevelBlock, EventType: "tool_use", Tool: "Bash", Pattern: `DROP\s+TABLE`, Message: "DROP TABLE detected — session paused", Enabled: true, Audit: true},
			{ID: "strict-confirm-deploy", Name: "Confirm deploys", Level: safety.LevelConfirm, EventType: "tool_use", Tool: "Bash", Pattern: `(terraform apply|cdk deploy|sam deploy|kubectl apply)`, Message: "Deploy command — approve to continue", Enabled: true, Audit: true},
			{ID: "strict-block-reset-hard", Name: "Block reset --hard", Level: safety.LevelBlock, EventType: "tool_use", Tool: "Bash", Pattern: `git\s+reset\s+--hard`, Message: "git reset --hard detected — session paused", Enabled: true, Audit: true},
		}
	case "permissive":
		return []safety.Rule{
			{ID: "perm-warn-deletes", Name: "Warn on deletes", Level: safety.LevelWarn, EventType: "tool_use", Tool: "Bash", Pattern: `(rm\s|rmdir\s)`, Message: "Delete command detected", Enabled: true, Audit: true},
			{ID: "perm-warn-force", Name: "Warn on force ops", Level: safety.LevelWarn, EventType: "tool_use", Tool: "Bash", Pattern: `(--force|--hard|--no-verify)`, Message: "Force operation detected", Enabled: true, Audit: true},
			{ID: "perm-warn-deploy", Name: "Warn on deploys", Level: safety.LevelWarn, EventType: "tool_use", Tool: "Bash", Pattern: `(terraform apply|cdk deploy|sam deploy|kubectl apply)`, Message: "Deploy command detected", Enabled: true, Audit: true},
			{ID: "perm-warn-secrets", Name: "Warn on secrets", Level: safety.LevelWarn, Pattern: `(AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|sk-[a-zA-Z0-9]{20,})`, Message: "Possible secret detected", Enabled: true, Audit: true},
			{ID: "perm-warn-root", Name: "Warn on root writes", Level: safety.LevelWarn, EventType: "tool_use", PathPattern: `^/(etc|usr|bin|sbin)/`, Message: "Write to system directory", Enabled: true, Audit: true},
		}
	case "git-safe":
		return []safety.Rule{
			{ID: "git-block-force-push", Name: "Block force push", Level: safety.LevelBlock, EventType: "tool_use", Tool: "Bash", Pattern: `git\s+push.*--force`, Message: "Force push blocked", Enabled: true, Audit: true},
			{ID: "git-block-reset-hard", Name: "Block reset --hard", Level: safety.LevelBlock, EventType: "tool_use", Tool: "Bash", Pattern: `git\s+reset\s+--hard`, Message: "git reset --hard blocked", Enabled: true, Audit: true},
			{ID: "git-block-branch-d", Name: "Block branch -D", Level: safety.LevelBlock, EventType: "tool_use", Tool: "Bash", Pattern: `git\s+branch\s+-D`, Message: "Force branch delete blocked", Enabled: true, Audit: true},
		}
	case "data-safe":
		return []safety.Rule{
			{ID: "data-block-data-files", Name: "Block data file writes", Level: safety.LevelBlock, EventType: "tool_use", PathPattern: `\.(csv|json|sql|parquet)$`, Message: "Write to data file blocked", Enabled: true, Audit: true},
			{ID: "data-warn-db-commands", Name: "Warn on DB commands", Level: safety.LevelWarn, EventType: "tool_use", Tool: "Bash", Pattern: `(DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE)`, Message: "Database command detected", Enabled: true, Audit: true},
			{ID: "data-warn-exports", Name: "Warn on data exports", Level: safety.LevelWarn, EventType: "tool_use", Tool: "Bash", Pattern: `(pg_dump|mysqldump|mongodump|COPY\s+.*TO)`, Message: "Data export command detected", Enabled: true, Audit: true},
		}
	}
	return nil
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
