// Author: Subash Karki
package composer

import (
	"context"
	"testing"
	"time"
)

func TestEnrichmentPipeline_CollectsAllSources(t *testing.T) {
	pipeline := &EnrichmentPipeline{
		Timeout: 500 * time.Millisecond,
	}

	editorCtx := &EditorContext{
		FilePath: "session.go",
		Cursor:   "142",
		Language: "go",
	}

	result := pipeline.Enrich(context.Background(), EnrichmentInput{
		SessionID:     "test-session",
		UserText:      "fix the watchdog",
		CWD:           "/tmp/test",
		EditorContext: editorCtx,
	})

	if len(result.Chips) == 0 {
		t.Fatal("expected at least one chip from editor context")
	}

	var foundEditor bool
	for _, chip := range result.Chips {
		if chip.Source == "editor" {
			foundEditor = true
			if chip.Status != "success" {
				t.Errorf("editor chip status = %q, want %q", chip.Status, "success")
			}
			if chip.Label != "Editor: session.go:142" {
				t.Errorf("editor chip label = %q, want %q", chip.Label, "Editor: session.go:142")
			}
		}
	}
	if !foundEditor {
		t.Fatal("expected editor chip in results")
	}

	if result.XMLBlock == "" {
		t.Fatal("expected non-empty XML block")
	}
}

func TestEnrichmentPipeline_PartialTimeout(t *testing.T) {
	pipeline := &EnrichmentPipeline{
		Timeout: 50 * time.Millisecond,
		StrategyCollector: func(ctx context.Context, input EnrichmentInput) collectorResult {
			time.Sleep(200 * time.Millisecond)
			return collectorResult{Source: "strategy", XML: "<strategy/>", Tokens: 100}
		},
	}

	result := pipeline.Enrich(context.Background(), EnrichmentInput{
		SessionID: "test-session",
		UserText:  "fix the bug",
		CWD:       "/tmp/test",
		EditorContext: &EditorContext{FilePath: "main.go", Cursor: "1"},
	})

	var strategyChip *ChipEvent
	for i, chip := range result.Chips {
		if chip.Source == "strategy" {
			strategyChip = &result.Chips[i]
		}
	}
	if strategyChip == nil {
		t.Fatal("expected strategy chip even on timeout")
	}
	if strategyChip.Status != "error" {
		t.Errorf("timed-out strategy chip status = %q, want %q", strategyChip.Status, "error")
	}
}

func TestEnrichmentPipeline_NilEditorContext(t *testing.T) {
	pipeline := &EnrichmentPipeline{
		Timeout: 500 * time.Millisecond,
	}

	result := pipeline.Enrich(context.Background(), EnrichmentInput{
		SessionID:     "test-session",
		UserText:      "hello",
		CWD:           "/tmp/test",
		EditorContext: nil,
	})

	for _, chip := range result.Chips {
		if chip.Source == "editor" && chip.Status == "success" {
			t.Fatal("should not have success editor chip when EditorContext is nil")
		}
	}
}
