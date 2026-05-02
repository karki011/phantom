// phantom-mcp is the standalone Phantom MCP stdio server.
//
// Spawned by Claude Code as a child process, communicates over stdin/stdout
// using JSON-RPC 2.0 per the MCP spec. Auto-detects the project ID from the
// current working directory by walking up the tree and matching against the
// SQLite DB at ~/.phantom-os/phantom.db.
//
// Author: Subash Karki
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/embedding"
	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
	"github.com/subashkarki/phantom-os-v2/internal/conflict"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	mcpserver "github.com/subashkarki/phantom-os-v2/internal/mcp"
)

func main() {
	dbPath, err := db.DefaultDBPath()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[phantom-mcp] resolve db path: %v\n", err)
		os.Exit(1)
	}

	database, err := db.Open(dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[phantom-mcp] open db: %v\n", err)
		os.Exit(1)
	}
	defer database.Reader.Close()
	defer database.Writer.Close()

	queries := db.New(database.Reader)

	projectID := mcpserver.DetectProjectID(context.Background(), queries)
	if projectID == "" {
		fmt.Fprintln(os.Stderr, "[phantom-mcp] no project detected — running unscoped")
	} else {
		fmt.Fprintf(os.Stderr, "[phantom-mcp] project: %s\n", projectID)
	}

	pool := mcpserver.NewIndexerPool()
	defer pool.Close()

	// Wire the learning loop. All knowledge components are best-effort: if any
	// fails to initialize, we log to stderr and continue with a stateless
	// orchestrator — Process degrades gracefully when fields are nil.
	decisions, err := knowledge.NewDecisionStore(database.Writer)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[phantom-mcp] decision store: %v (learning loop disabled)\n", err)
	}
	compactor, err := knowledge.NewCompactor(database.Writer)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[phantom-mcp] compactor: %v (learning loop disabled)\n", err)
	}
	performance := strategies.NewPerformanceStore()
	if err := performance.Load(database.Reader); err != nil {
		fmt.Fprintf(os.Stderr, "[phantom-mcp] load performance: %v (starting empty)\n", err)
	}
	autoTune := strategies.NewThresholdTracker()
	if err := autoTune.LoadThresholds(database.Reader); err != nil {
		fmt.Fprintf(os.Stderr, "[phantom-mcp] load auto-tune: %v (using defaults)\n", err)
	}

	// Create embedding engine and vector store for semantic memory features.
	// Both degrade gracefully: embedder falls back to a stub when ONNX is
	// unavailable, and VectorStore returns nil on failure — all consumers
	// nil-check before use.
	embedder, _ := embedding.NewEmbedder()
	vectorStore, vsErr := embedding.NewVectorStore(database.Writer, embedder)
	if vsErr != nil {
		fmt.Fprintf(os.Stderr, "[phantom-mcp] vector store: %v (semantic features disabled)\n", vsErr)
		vectorStore = nil
	}

	// Wire vector store into knowledge components for semantic retrieval.
	if decisions != nil && vectorStore != nil {
		decisions.SetVectorStore(vectorStore)
	}
	if compactor != nil && vectorStore != nil {
		compactor.SetVectorStore(vectorStore)
	}

	// Conflict tracker — enables multi-session conflict awareness so the
	// orchestrator and phantom_conflict_status can detect when multiple
	// Claude Code sessions are editing the same repository.
	tracker := conflict.NewTracker(nil)

	// Register this MCP process as an active session so other instances
	// can see it via GetActiveSessions. The CWD is resolved to the git
	// repo root internally by the tracker.
	cwd, _ := os.Getwd()
	sessionID := fmt.Sprintf("mcp-%d", os.Getpid())
	tracker.Register(conflict.Session{
		ID:        sessionID,
		SessionID: sessionID,
		Name:      "Claude Code",
		Source:    "mcp",
		RepoCWD:   cwd,
		StartedAt: time.Now(),
	})

	deps := &mcpserver.Deps{
		Queries:         queries,
		Indexers:        pool,
		Builder:         pool,
		V1Bridge:        knowledge.NewV1Bridge(),
		ProjectID:       projectID,
		Decisions:       decisions,
		Performance:     performance,
		AutoTune:        autoTune,
		GapDetector:     strategies.NewGapDetector(),
		Compactor:       compactor,
		ConflictTracker: tracker,
		VectorStore:     vectorStore,
	}

	if err := mcpserver.Run(deps); err != nil {
		fmt.Fprintf(os.Stderr, "[phantom-mcp] serve: %v\n", err)
		os.Exit(1)
	}
}
