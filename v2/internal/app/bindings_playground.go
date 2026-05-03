// bindings_playground.go exposes a dry-run AI engine analysis to the Wails
// frontend. PlaygroundProcess runs the full orchestrator pipeline — strategy
// selection, file inference, blast radius, session memory — without spawning
// Claude. This powers the interactive "AI Engine Playground" pane.
//
// Author: Subash Karki
package app

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/ai/embedding"
	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
	"github.com/subashkarki/phantom-os-v2/internal/ai/orchestrator"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
	"github.com/subashkarki/phantom-os-v2/internal/branding"
	"github.com/subashkarki/phantom-os-v2/internal/composer"
)

// PlaygroundAlternative is the wire shape for a single strategy alternative.
type PlaygroundAlternative struct {
	Name   string  `json:"name"`
	Score  float64 `json:"score"`
	Reason string  `json:"reason"`
}

// PlaygroundGraphStats surfaces file graph metrics when available.
type PlaygroundGraphStats struct {
	FilesIndexed   int `json:"files_indexed"`
	SymbolsIndexed int `json:"symbols_indexed"`
	EdgeCount      int `json:"edge_count"`
}

// PlaygroundResult is the wire shape for the AI Engine Playground.
type PlaygroundResult struct {
	Strategy       string                  `json:"strategy"`
	Confidence     float64                 `json:"confidence"`
	Complexity     string                  `json:"complexity"`
	Risk           string                  `json:"risk"`
	BlastRadius    int                     `json:"blast_radius"`
	FileCount      int                     `json:"file_count"`
	AmbiguityScore float64                 `json:"ambiguity_score"`
	IsAmbiguous    bool                    `json:"is_ambiguous"`
	InferredFiles  []string                `json:"inferred_files"`
	Alternatives   []PlaygroundAlternative `json:"alternatives"`
	EnrichedPrompt string                  `json:"enriched_prompt"`
	SessionMemory  string                  `json:"session_memory"`
	GraphStats     *PlaygroundGraphStats   `json:"graph_stats"`
	DurationMs     int64                   `json:"duration_ms"`
}

// PlaygroundProcess runs the full AI engine pipeline as a dry run — no Claude
// is spawned. Returns strategy selection, alternatives, inferred files,
// enriched prompt, and session memory for the given goal and CWD.
func (a *App) PlaygroundProcess(goal string, cwd string) (*PlaygroundResult, error) {
	start := time.Now()

	if goal == "" {
		return nil, fmt.Errorf("playground: goal must be non-empty")
	}
	if cwd == "" {
		return nil, fmt.Errorf("playground: cwd must be non-empty")
	}

	// 1. Resolve indexer for the CWD (same as composer per-turn resolution).
	ix := a.resolveIndexerForCwd(cwd)

	// 2. Infer files from prompt via symbol extraction + grep.
	var inferredFiles []string
	if ix != nil {
		inferredFiles = composer.InferFilesFromPrompt(ix, goal)
	}

	// 3. Build orchestrator dependencies (mirrors wireComposerEngine but
	//    read-only — no decision recording for dry runs).
	deps := a.buildPlaygroundDeps(ix)

	// 4. Run orchestrator.Process for the full pipeline.
	result, err := orchestrator.Process(context.Background(), deps, orchestrator.ProcessInput{
		Goal:        goal,
		CWD:         cwd,
		ActiveFiles: inferredFiles,
	})
	if err != nil {
		return nil, fmt.Errorf("playground: orchestrator failed: %w", err)
	}

	// 5. Build session memory.
	memBuilder := &composer.SessionMemoryBuilder{
		Decisions:      deps.Decisions,
		GlobalPatterns: deps.GlobalPatterns,
		Indexer:        ix,
	}
	sessionMemory := memBuilder.Build()

	// 6. Gather graph stats if indexer is available.
	var graphStats *PlaygroundGraphStats
	if ix != nil {
		files, symbols, edges := ix.Graph().Stats()
		graphStats = &PlaygroundGraphStats{
			FilesIndexed:   files,
			SymbolsIndexed: symbols,
			EdgeCount:      edges,
		}
	}

	// 7. Build the wire response.
	alts := make([]PlaygroundAlternative, 0, len(result.Alternatives))
	for _, alt := range result.Alternatives {
		alts = append(alts, PlaygroundAlternative{
			Name:   alt.Name,
			Score:  alt.Score,
			Reason: alt.Reason,
		})
	}

	elapsed := time.Since(start).Milliseconds()
	log.Info("playground: analysis complete",
		"strategy", result.Strategy.Name,
		"confidence", result.Confidence,
		"files", len(inferredFiles),
		"durationMs", elapsed,
	)

	return &PlaygroundResult{
		Strategy:       result.Strategy.Name,
		Confidence:     result.Confidence,
		Complexity:     result.TaskContext.Complexity,
		Risk:           result.TaskContext.Risk,
		BlastRadius:    result.TaskContext.BlastRadius,
		FileCount:      result.TaskContext.FileCount,
		AmbiguityScore: result.TaskContext.AmbiguityScore,
		IsAmbiguous:    result.TaskContext.IsAmbiguous,
		InferredFiles:  inferredFiles,
		Alternatives:   alts,
		EnrichedPrompt: result.Output.Text,
		SessionMemory:  sessionMemory,
		GraphStats:     graphStats,
		DurationMs:     elapsed,
	}, nil
}

// buildPlaygroundDeps assembles read-only orchestrator dependencies for the
// playground. Unlike wireComposerEngine, this does NOT record decisions or
// persist outcomes — it's a pure dry run. Each component is best-effort:
// nil stores degrade gracefully inside orchestrator.Process.
func (a *App) buildPlaygroundDeps(ix *filegraph.Indexer) orchestrator.Dependencies {
	deps := orchestrator.Dependencies{
		Indexer: ix,
	}

	if a.DB == nil {
		return deps
	}

	// Decision store (Writer required — NewDecisionStore runs CREATE TABLE IF
	// NOT EXISTS). Playground runs are recorded as decisions so future strategy
	// selection benefits from the history.
	if ds, err := knowledge.NewDecisionStore(a.DB.Writer); err == nil {
		// Wire vector store for semantic retrieval if available.
		embedder, _ := embedding.NewEmbedder()
		if vs, vsErr := embedding.NewVectorStore(a.DB.Writer, embedder); vsErr == nil {
			ds.SetVectorStore(vs)
			deps.VectorStore = vs
		}
		deps.Decisions = ds
	} else {
		log.Debug("playground: decision store init failed", "err", err)
	}

	// Performance store (read from Writer DB — same handle used by composer).
	perf := strategies.NewPerformanceStore()
	if err := perf.Load(a.DB.Writer); err == nil {
		deps.Performance = perf
	}

	// Auto-tune thresholds.
	autoTune := strategies.NewThresholdTracker()
	if err := autoTune.LoadThresholds(a.DB.Writer); err == nil {
		deps.AutoTune = autoTune
	}

	// Gap detector.
	deps.GapDetector = strategies.NewGapDetector()

	// Global pattern store.
	home, _ := os.UserHomeDir()
	aiEngineDir := filepath.Join(home, branding.ConfigDirName, "ai-engine")
	if gps, err := knowledge.NewGlobalPatternStore(aiEngineDir); err == nil {
		deps.GlobalPatterns = gps
	}

	// Conflict tracker — reuse the app's tracker for live session awareness.
	if a.ConflictTracker != nil {
		deps.ConflictTracker = a.ConflictTracker
	}

	return deps
}
