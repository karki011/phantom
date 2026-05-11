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

	// Auto-trigger graph build when a project is detected so tools are
	// immediately usable without requiring an explicit phantom_graph_build call.
	// The build runs in the background; graph tools degrade gracefully while
	// the indexer warms up (returning "build the graph first" until ready).
	if projectID != "" {
		project, err := queries.GetProject(context.Background(), projectID)
		if err == nil {
			if _, _, buildErr := pool.Build(context.Background(), projectID, project.RepoPath); buildErr != nil {
				fmt.Fprintf(os.Stderr, "[phantom-mcp] auto-build: %v\n", buildErr)
			} else {
				fmt.Fprintf(os.Stderr, "[phantom-mcp] graph build started for %s\n", projectID)
			}
		} else {
			fmt.Fprintf(os.Stderr, "[phantom-mcp] auto-build skipped: project not in db: %v\n", err)
		}
	}

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
	}

	if err := mcpserver.Run(deps); err != nil {
		fmt.Fprintf(os.Stderr, "[phantom-mcp] serve: %v\n", err)
		os.Exit(1)
	}
}
