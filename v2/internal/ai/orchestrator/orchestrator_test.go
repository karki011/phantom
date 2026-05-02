// Author: Subash Karki
package orchestrator

import (
	"context"
	"log/slog"
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/conflict"
)

// stubResolver returns the input as-is so tests don't need real git repos.
func stubResolver(cwd string) string { return cwd }

func TestProcess_EmptyGoal(t *testing.T) {
	_, err := Process(context.Background(), Dependencies{}, ProcessInput{Goal: ""})
	if err != ErrEmptyGoal {
		t.Fatalf("expected ErrEmptyGoal, got %v", err)
	}
}

func TestProcess_StatelessRun(t *testing.T) {
	result, err := Process(context.Background(), Dependencies{}, ProcessInput{
		Goal: "refactor the login handler",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Strategy.ID == "" {
		t.Fatal("expected a strategy to be selected")
	}
	if result.Confidence <= 0 {
		t.Fatal("expected positive confidence")
	}
	if result.Learning == nil {
		t.Fatal("expected learning summary")
	}
}

func TestProcess_NilConflictTracker(t *testing.T) {
	// ConflictTracker is nil — should degrade gracefully with zero conflict fields.
	result, err := Process(context.Background(), Dependencies{}, ProcessInput{
		Goal: "add user endpoint",
		CWD:  "/some/repo",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Learning.ConflictSessionCount != 0 {
		t.Fatalf("expected 0 conflict sessions, got %d", result.Learning.ConflictSessionCount)
	}
	if result.Learning.ConflictRiskBoost != 0 {
		t.Fatalf("expected 0 conflict risk boost, got %f", result.Learning.ConflictRiskBoost)
	}
}

func TestProcess_EmptyCWD(t *testing.T) {
	// CWD is empty — conflict detection should be skipped even with a tracker.
	tracker := conflict.NewTracker(slog.Default(), conflict.WithRepoRootResolver(stubResolver))
	tracker.Register(conflict.Session{ID: "s1", RepoCWD: "/repo"})

	result, err := Process(context.Background(), Dependencies{
		ConflictTracker: tracker,
	}, ProcessInput{
		Goal: "fix bug",
		CWD:  "", // empty — no conflict detection
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Learning.ConflictSessionCount != 0 {
		t.Fatalf("expected 0 conflict sessions with empty CWD, got %d", result.Learning.ConflictSessionCount)
	}
}

func TestProcess_SingleSession_NoBoost(t *testing.T) {
	// One session active — no risk boost (only this session).
	tracker := conflict.NewTracker(slog.Default(), conflict.WithRepoRootResolver(stubResolver))
	tracker.Register(conflict.Session{ID: "s1", RepoCWD: "/repo"})

	result, err := Process(context.Background(), Dependencies{
		ConflictTracker: tracker,
	}, ProcessInput{
		Goal: "add tests",
		CWD:  "/repo",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Learning.ConflictSessionCount != 1 {
		t.Fatalf("expected 1 session, got %d", result.Learning.ConflictSessionCount)
	}
	if result.Learning.ConflictRiskBoost != 0 {
		t.Fatalf("expected 0 risk boost for single session, got %f", result.Learning.ConflictRiskBoost)
	}
}

func TestProcess_MultipleSessionsBoostRisk(t *testing.T) {
	tracker := conflict.NewTracker(slog.Default(), conflict.WithRepoRootResolver(stubResolver))
	tracker.Register(conflict.Session{ID: "s1", RepoCWD: "/repo"})
	tracker.Register(conflict.Session{ID: "s2", RepoCWD: "/repo"})
	tracker.Register(conflict.Session{ID: "s3", RepoCWD: "/repo"})

	result, err := Process(context.Background(), Dependencies{
		ConflictTracker: tracker,
	}, ProcessInput{
		Goal: "refactor auth module",
		CWD:  "/repo",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Learning.ConflictSessionCount != 3 {
		t.Fatalf("expected 3 sessions, got %d", result.Learning.ConflictSessionCount)
	}
	// 2 extra sessions * 0.15 = 0.30
	expectedBoost := 0.30
	if result.Learning.ConflictRiskBoost != expectedBoost {
		t.Fatalf("expected risk boost %f, got %f", expectedBoost, result.Learning.ConflictRiskBoost)
	}
}

func TestProcess_ConflictRiskBoostCapped(t *testing.T) {
	tracker := conflict.NewTracker(slog.Default(), conflict.WithRepoRootResolver(stubResolver))
	// Register 6 sessions to push boost to 0.75, which should be capped at 0.6.
	for i := range 6 {
		tracker.Register(conflict.Session{
			ID:      "s" + string(rune('0'+i)),
			RepoCWD: "/repo",
		})
	}

	result, err := Process(context.Background(), Dependencies{
		ConflictTracker: tracker,
	}, ProcessInput{
		Goal: "critical migration",
		CWD:  "/repo",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Learning.ConflictRiskBoost != 0.6 {
		t.Fatalf("expected capped risk boost 0.6, got %f", result.Learning.ConflictRiskBoost)
	}
}

func TestProcess_ConflictReducesConfidence(t *testing.T) {
	// Same goal, same deps — with conflicts confidence should be lower.
	tracker := conflict.NewTracker(slog.Default(), conflict.WithRepoRootResolver(stubResolver))
	tracker.Register(conflict.Session{ID: "s1", RepoCWD: "/repo"})
	tracker.Register(conflict.Session{ID: "s2", RepoCWD: "/repo"})

	input := ProcessInput{
		Goal: "update config handler",
		CWD:  "/repo",
	}

	// Without conflict tracker.
	resultClean, err := Process(context.Background(), Dependencies{}, input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// With conflict tracker (2 sessions = 0.15 boost = 15% penalty).
	resultConflict, err := Process(context.Background(), Dependencies{
		ConflictTracker: tracker,
	}, input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resultConflict.Confidence >= resultClean.Confidence {
		t.Fatalf("conflict confidence (%f) should be less than clean confidence (%f)",
			resultConflict.Confidence, resultClean.Confidence)
	}
}
