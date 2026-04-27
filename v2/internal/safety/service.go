// service.go is the high-level Safety service that wires loader, evaluator, and audit together.
// Author: Subash Karki
package safety

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// journalAppender is the subset of journal.Service used by Safety
// to append ward trigger events to the daily work log.
type journalAppender interface {
	AppendWorkLog(date, line string)
}

// Service is the entry point for the PhantomOS Safety Rules Engine.
type Service struct {
	loader    *Loader
	evaluator *Evaluator
	audit     *AuditStore
	pii       bool // enable PII scanning on tool input before evaluation
	emitEvent func(string, interface{})
	journal   journalAppender
}

// NewService creates a Service. wardsDir is the directory containing ward YAML files.
// writer is the SQLite writer connection for audit persistence.
// emitEvent is the Wails runtime.EventsEmit function (or equivalent).
func NewService(wardsDir string, writer *sql.DB, emitEvent func(string, interface{})) (*Service, error) {
	svc := &Service{
		emitEvent: emitEvent,
	}

	svc.audit = NewAuditStore(writer)

	svc.loader = NewLoader(wardsDir, func() {
		log.Printf("safety: rules reloaded from %s", wardsDir)
		if emitEvent != nil {
			emitEvent("ward:rules_reloaded", map[string]interface{}{"dir": wardsDir})
		}
	})

	svc.evaluator = NewEvaluator(svc.loader)
	return svc, nil
}

// SetJournal injects the journal service so ward triggers are logged
// to the daily work log.
func (s *Service) SetJournal(j journalAppender) { s.journal = j }

// EnablePIIScanning turns on PII masking of tool inputs before evaluation.
func (s *Service) EnablePIIScanning() { s.pii = true }

// Start initializes the audit table and begins watching for YAML file changes.
func (s *Service) Start(ctx context.Context) error {
	if err := s.audit.Init(ctx); err != nil {
		return err
	}
	if err := s.loader.Load(); err != nil {
		log.Printf("safety: initial load: %v", err)
	}
	return s.loader.Start(ctx)
}

// Stop shuts down the file watcher.
func (s *Service) Stop() {
	s.loader.Stop()
}

// Evaluate checks a stream event against all loaded rules.
// Triggered evaluations are recorded to the audit trail when the rule has Audit=true.
// Wails events emitted: "ward:triggered", "ward:blocked", "ward:warned".
func (s *Service) Evaluate(ctx context.Context, ev *stream.Event) []Evaluation {
	evals := s.evaluator.Evaluate(ev)

	for _, eval := range evals {
		// Emit Wails events.
		if s.emitEvent != nil {
			s.emitEvent("ward:triggered", eval)
			switch eval.Level {
			case LevelBlock:
				s.emitEvent("ward:blocked", eval)
			case LevelWarn:
				s.emitEvent("ward:warned", eval)
			}
		}

		// Journal: log ward trigger to daily work log.
		if s.journal != nil {
			today := time.Now().Format("2006-01-02")
			ts := time.Now().Format("15:04")
			s.journal.AppendWorkLog(today, fmt.Sprintf("%s ⚠️ Ward triggered: %s", ts, eval.RuleName))
		}

		// Look up the rule to check Audit flag.
		rule := s.loader.RuleByID(eval.RuleID)
		if rule != nil && rule.Audit {
			if err := s.audit.Record(ctx, eval); err != nil {
				log.Printf("safety: audit record %s: %v", eval.RuleID, err)
			}
		}
	}

	return evals
}

// GetRules returns the currently loaded rule set.
func (s *Service) GetRules() []Rule {
	return s.loader.Rules()
}

// SaveRule adds or updates a rule in the custom.yaml file.
func (s *Service) SaveRule(rule Rule) error {
	return s.loader.SaveRule(rule)
}

// DeleteRule removes a rule by ID from custom.yaml.
func (s *Service) DeleteRule(ruleID string) error {
	return s.loader.DeleteRule(ruleID)
}

// ReplaceCustomRules replaces all rules in custom.yaml with the given set.
func (s *Service) ReplaceCustomRules(rules []Rule) error {
	return s.loader.ReplaceCustomRules(rules)
}

// ToggleRule enables or disables a rule in custom.yaml.
func (s *Service) ToggleRule(ruleID string, enabled bool) error {
	return s.loader.ToggleRule(ruleID, enabled)
}

// GetAuditTrail returns audit entries matching the given options.
func (s *Service) GetAuditTrail(ctx context.Context, opts AuditQueryOpts) ([]Evaluation, error) {
	return s.audit.Query(ctx, opts)
}

// GetStats returns aggregate audit statistics.
func (s *Service) GetStats(ctx context.Context) (*AuditStats, error) {
	return s.audit.Stats(ctx)
}
