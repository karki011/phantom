// phantom-mcp is the standalone PhantomOS MCP stdio server.
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

	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
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

	deps := &mcpserver.Deps{
		Queries:        queries,
		Indexers:       pool,
		Builder:        pool,
		V1Bridge:       knowledge.NewV1Bridge(),
		ProjectID:      projectID,
		Decisions:      decisions,
		Performance:    performance,
		AutoTune:       autoTune,
		GapDetector:    strategies.NewGapDetector(),
		Compactor:      compactor,
	}

	if err := mcpserver.Run(deps); err != nil {
		fmt.Fprintf(os.Stderr, "[phantom-mcp] serve: %v\n", err)
		os.Exit(1)
	}
}
