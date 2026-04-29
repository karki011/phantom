// MCP server bootstrap and tool registration.
// Builds an mcp-go MCPServer, registers all 12 phantom_* tools, and exposes
// Run for the standalone stdio binary.
//
// Author: Subash Karki
package mcp

import (
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// Instructions are surfaced by the SDK during MCP handshake — Claude Code
// reads them on connect. Kept identical (in spirit) to v1.
const Instructions = `## PhantomOS AI Engine — Automatic Codebase Intelligence

You have access to a dependency-graph-backed AI engine that tracks every file relationship,
predicts blast radius of changes, and learns from past decisions.

### REQUIRED WORKFLOW
Before modifying ANY file, call ` + "`phantom_before_edit`" + ` with the file paths.
This gives you everything in one call: dependencies, blast radius, related files, and strategy guidance.

### AVAILABLE TOOLS
- phantom_before_edit: ONE call gives you everything (context + blast radius + strategy). Use this first.
- phantom_graph_context: Deep-dive into a specific file's dependencies
- phantom_graph_blast_radius: What breaks if this file changes
- phantom_graph_related: Find all files involved in a feature
- phantom_graph_stats: Graph coverage statistics
- phantom_graph_path: Shortest dependency path between two files
- phantom_orchestrator_process: Route complex goals through the strategy pipeline
- phantom_orchestrator_history: Learn from past decisions

### WHAT YOU GET
The engine automatically tracks your decisions and outcomes. Over time, it learns
which approaches work for this codebase and warns you about approaches that failed before.`

// New builds an MCP server with all phantom_* tools registered.
//
// scopedProjectID: when set, tools auto-fill projectId from this value and the
// projectId input field is omitted from each tool's schema. This matches v1
// behaviour where the stdio entry binds the server to the auto-detected
// project for the spawning shell.
func New(deps *Deps) *server.MCPServer {
	s := server.NewMCPServer(
		"phantom-os",
		"2.0.0",
		server.WithToolCapabilities(true),
		server.WithInstructions(Instructions),
	)

	scoped := deps.ProjectID != ""
	registerTools(s, deps, scoped)
	return s
}

// Run boots an MCP server and serves over stdio until stdin closes.
func Run(deps *Deps) error {
	return server.ServeStdio(New(deps))
}

// projectIDOpt returns the projectId tool option when the server is unscoped.
// When scoped, projectId is auto-injected and not part of the input schema.
func projectIDOpt(scoped bool) mcp.ToolOption {
	if scoped {
		return func(t *mcp.Tool) {} // no-op
	}
	return mcp.WithString("projectId",
		mcp.Description("Project ID"),
		mcp.Required(),
	)
}

func registerTools(s *server.MCPServer, deps *Deps, scoped bool) {
	// 1. phantom_before_edit
	s.AddTool(mcp.NewTool("phantom_before_edit",
		mcp.WithDescription("REQUIRED before modifying files. Returns graph context, blast radius, related files, and strategy recommendation in one call."),
		projectIDOpt(scoped),
		mcp.WithArray("files",
			mcp.Description("File paths you plan to modify"),
			mcp.Required(),
			mcp.Items(map[string]any{"type": "string"}),
		),
		mcp.WithString("goal",
			mcp.Description("What you are trying to accomplish"),
		),
	), deps.HandleBeforeEdit)

	// 2. phantom_graph_context
	s.AddTool(mcp.NewTool("phantom_graph_context",
		mcp.WithDescription("Get files related to a specific file with relevance scores and dependency edges."),
		projectIDOpt(scoped),
		mcp.WithString("file",
			mcp.Description("File path relative to project root"),
			mcp.Required(),
		),
		mcp.WithNumber("depth",
			mcp.Description("BFS traversal depth (default 2)"),
		),
	), deps.HandleGraphContext)

	// 3. phantom_graph_blast_radius
	s.AddTool(mcp.NewTool("phantom_graph_blast_radius",
		mcp.WithDescription("Predict which files will break if a given file is changed."),
		projectIDOpt(scoped),
		mcp.WithString("file",
			mcp.Description("File path to analyze"),
			mcp.Required(),
		),
	), deps.HandleBlastRadius)

	// 4. phantom_graph_related
	s.AddTool(mcp.NewTool("phantom_graph_related",
		mcp.WithDescription("Find files related to a set of files."),
		projectIDOpt(scoped),
		mcp.WithArray("files",
			mcp.Description("Array of file paths"),
			mcp.Required(),
			mcp.Items(map[string]any{"type": "string"}),
		),
		mcp.WithNumber("depth",
			mcp.Description("Neighbor traversal depth (default 1)"),
		),
	), deps.HandleRelated)

	// 5. phantom_graph_stats
	s.AddTool(mcp.NewTool("phantom_graph_stats",
		mcp.WithDescription("Get graph statistics — file count, edge count, module count, coverage."),
		projectIDOpt(scoped),
	), deps.HandleStats)

	// 6. phantom_graph_path
	s.AddTool(mcp.NewTool("phantom_graph_path",
		mcp.WithDescription("Find the shortest dependency path between two files."),
		projectIDOpt(scoped),
		mcp.WithString("from",
			mcp.Description("Source file path"),
			mcp.Required(),
		),
		mcp.WithString("to",
			mcp.Description("Target file path"),
			mcp.Required(),
		),
	), deps.HandlePath)

	// 7. phantom_graph_build
	s.AddTool(mcp.NewTool("phantom_graph_build",
		mcp.WithDescription("Trigger a graph rebuild after major changes. Returns immediately while build runs in background."),
		projectIDOpt(scoped),
	), deps.HandleBuild)

	// 8. phantom_task_status
	s.AddTool(mcp.NewTool("phantom_task_status",
		mcp.WithDescription("Poll the build lifecycle status of a project graph."),
		projectIDOpt(scoped),
	), deps.HandleTaskStatus)

	// 9. phantom_list_projects
	s.AddTool(mcp.NewTool("phantom_list_projects",
		mcp.WithDescription("List all known projects with their IDs and repo paths."),
	), deps.HandleListProjects)

	// 10. phantom_evaluate_output
	s.AddTool(mcp.NewTool("phantom_evaluate_output",
		mcp.WithDescription("Evaluate a strategy output for quality. Returns a confidence score (0–1) and brief feedback."),
		mcp.WithString("goal",
			mcp.Description("The goal or task the output was generated for"),
			mcp.Required(),
		),
		mcp.WithString("output",
			mcp.Description("The strategy output to evaluate"),
			mcp.Required(),
		),
	), deps.HandleEvaluateOutput)

	// 11. phantom_orchestrator_process
	s.AddTool(mcp.NewTool("phantom_orchestrator_process",
		mcp.WithDescription("Route a goal through the AI strategy pipeline."),
		projectIDOpt(scoped),
		mcp.WithString("goal",
			mcp.Description("What the user wants to accomplish"),
			mcp.Required(),
		),
		mcp.WithArray("activeFiles",
			mcp.Description("Files currently being worked with"),
			mcp.Items(map[string]any{"type": "string"}),
		),
		mcp.WithObject("hints",
			mcp.Description("Optional task hints"),
			mcp.Properties(map[string]any{
				"isAmbiguous": map[string]any{"type": "boolean"},
				"isCritical":  map[string]any{"type": "boolean"},
				"estimatedComplexity": map[string]any{
					"type": "string",
					"enum": []string{"simple", "moderate", "complex", "critical"},
				},
			}),
		),
	), deps.HandleOrchestratorProcess)

	// 12. phantom_orchestrator_history
	s.AddTool(mcp.NewTool("phantom_orchestrator_history",
		mcp.WithDescription("View past orchestrator decisions, strategies used, and outcomes."),
		projectIDOpt(scoped),
		mcp.WithNumber("limit",
			mcp.Description("Max results (default 20)"),
		),
	), deps.HandleOrchestratorHistory)

	// 13. phantom_orchestrator_strategies
	s.AddTool(mcp.NewTool("phantom_orchestrator_strategies",
		mcp.WithDescription("List all available reasoning strategies and whether they are enabled."),
		projectIDOpt(scoped),
	), deps.HandleOrchestratorStrategies)
}
