// service.go is the high-level Safety service that wires loader, evaluator, and audit together.
// Author: Subash Karki
package safety

import (
	"context"
	"database/sql"
	"log"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// Service is the entry point for the PhantomOS Safety Rules Engine.
type Service struct {
	loader    *Loader
	evaluator *Evaluator
	audit     *AuditStore
	pii       bool // enable PII scanning on tool input before evaluation
	emitEvent func(string, interface{})
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

// GetAuditTrail returns audit entries matching the given options.
func (s *Service) GetAuditTrail(ctx context.Context, opts AuditQueryOpts) ([]Evaluation, error) {
	return s.audit.Query(ctx, opts)
}

// GetStats returns aggregate audit statistics.
func (s *Service) GetStats(ctx context.Context) (*AuditStats, error) {
	return s.audit.Stats(ctx)
}
