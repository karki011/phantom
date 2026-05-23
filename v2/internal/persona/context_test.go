// Author: Subash Karki
package persona

import (
	"context"
	"testing"
)

// TestContextEngine verifies that all ContextEngine methods handle nil/zero deps gracefully.
func TestContextEngine(t *testing.T) {
	ctx := context.Background()
	engine := NewContextEngine(ContextDeps{})

	t.Run("ClaudeSessions returns empty slice not nil", func(t *testing.T) {
		sessions := engine.ClaudeSessions(ctx, "")
		if sessions == nil {
			t.Fatal("expected non-nil slice, got nil")
		}
		if len(sessions) != 0 {
			t.Fatalf("expected empty slice, got %d items", len(sessions))
		}
	})

	t.Run("TerminalSessions returns empty slice not nil", func(t *testing.T) {
		terminals := engine.TerminalSessions(ctx)
		if terminals == nil {
			t.Fatal("expected non-nil slice, got nil")
		}
		if len(terminals) != 0 {
			t.Fatalf("expected empty slice, got %d items", len(terminals))
		}
	})

	t.Run("GitSummary returns zero-value struct", func(t *testing.T) {
		summary := engine.GitSummary(ctx, "/tmp")
		if summary.Branch != "" {
			t.Errorf("expected empty branch, got %q", summary.Branch)
		}
		if summary.Staged != 0 || summary.Unstaged != 0 || summary.Untracked != 0 {
			t.Errorf("expected all counts zero, got staged=%d unstaged=%d untracked=%d",
				summary.Staged, summary.Unstaged, summary.Untracked)
		}
		if summary.RecentCommits != nil {
			t.Errorf("expected nil commits, got %v", summary.RecentCommits)
		}
	})

	t.Run("GraphSummary returns zero-value struct", func(t *testing.T) {
		gs := engine.GraphSummary("/tmp")
		if gs.FileCount != 0 || gs.SymbolCount != 0 || gs.EdgeCount != 0 {
			t.Errorf("expected zero-value GraphSummary, got %+v", gs)
		}
	})

	t.Run("Assemble returns struct with ActiveProject set", func(t *testing.T) {
		pc := engine.Assemble(ctx, "/home/user/project", "wt-1")
		if pc.ActiveProject != "/home/user/project" {
			t.Errorf("expected ActiveProject=/home/user/project, got %q", pc.ActiveProject)
		}
		if pc.ClaudeSessions == nil {
			t.Error("expected non-nil ClaudeSessions")
		}
		if pc.TerminalSessions == nil {
			t.Error("expected non-nil TerminalSessions")
		}
	})

	t.Run("nil engine is safe", func(t *testing.T) {
		var nilEngine *ContextEngine
		// These must not panic.
		nilEngine.ClaudeSessions(ctx, "")
		nilEngine.TerminalSessions(ctx)
		nilEngine.GitSummary(ctx, "/tmp")
		nilEngine.GraphSummary("/tmp")
	})
}
