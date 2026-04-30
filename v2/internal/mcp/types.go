// Package mcp implements the Phantom Model Context Protocol server.
// It exposes the codebase graph, blast-radius, and orchestrator tooling
// to external AI agents (e.g. Claude Code) via stdio JSON-RPC.
//
// Wire schema mirrors the v1 TypeScript implementation in
// packages/server/src/mcp so existing clients keep working unchanged.
//
// Author: Subash Karki
package mcp

// FileRef represents a single file with a relevance score (0..1) used by
// graph_context and the before_edit composite tool.
type FileRef struct {
	Path      string  `json:"path"`
	Relevance float64 `json:"relevance"`
}

// EdgeRef is a single dependency edge between two file IDs.
type EdgeRef struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Type   string `json:"type"`
}

// GraphContextResult is returned by phantom_graph_context.
type GraphContextResult struct {
	Files   []FileRef `json:"files"`
	Edges   []EdgeRef `json:"edges"`
	Modules []string  `json:"modules"`
}

// BlastRadiusResult is returned by phantom_graph_blast_radius.
type BlastRadiusResult struct {
	DirectlyAffected     []string `json:"directlyAffected"`
	TransitivelyAffected []string `json:"transitivelyAffected"`
	ImpactScore          float64  `json:"impactScore"`
}

// RelatedResult is returned by phantom_graph_related.
type RelatedResult struct {
	RelatedFiles []string `json:"relatedFiles"`
}

// StatsResult is returned by phantom_graph_stats.
type StatsResult struct {
	Files       int     `json:"files"`
	Edges       int     `json:"edges"`
	Modules     int     `json:"modules"`
	Coverage    float64 `json:"coverage"`
	LastBuiltAt int64   `json:"lastBuiltAt"`
}

// PathResult is returned by phantom_graph_path.
type PathResult struct {
	Path   []string `json:"path"`
	Length int      `json:"length"`
}

// BuildResult is returned by phantom_graph_build.
type BuildResult struct {
	ProjectID string `json:"projectId,omitempty"`
	Status    string `json:"status"`
	StartedAt int64  `json:"startedAt,omitempty"`
	Message   string `json:"message"`
}

// TaskStatusResult is returned by phantom_task_status.
type TaskStatusResult struct {
	ProjectID  string `json:"projectId"`
	Status     string `json:"status"`
	StartedAt  int64  `json:"startedAt,omitempty"`
	FinishedAt int64  `json:"finishedAt,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
	Error      string `json:"error,omitempty"`
}

// ProjectListItem is one entry in phantom_list_projects.
type ProjectListItem struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	RepoPath string `json:"repoPath"`
}

// ProjectListResult is returned by phantom_list_projects.
type ProjectListResult struct {
	Projects []ProjectListItem `json:"projects"`
}

// EvaluateResult is returned by phantom_evaluate_output.
type EvaluateResult struct {
	Confidence float64 `json:"confidence"`
	Feedback   string  `json:"feedback"`
	Note       string  `json:"note,omitempty"`
}

// BeforeEditStrategy is the optional strategy block returned by phantom_before_edit
// when a goal is supplied.
type BeforeEditStrategy struct {
	Name       string  `json:"name"`
	Complexity string  `json:"complexity,omitempty"`
	Risk       string  `json:"risk,omitempty"`
	Confidence float64 `json:"confidence,omitempty"`
}

// BeforeEditResult is returned by phantom_before_edit.
type BeforeEditResult struct {
	Context      GraphContextResult  `json:"context"`
	BlastRadius  BlastRadiusResult   `json:"blastRadius"`
	RelatedFiles []string            `json:"relatedFiles"`
	Strategy     *BeforeEditStrategy `json:"strategy,omitempty"`
}

// OrchestratorDecision is one entry in phantom_orchestrator_history.
type OrchestratorDecision struct {
	ID         string  `json:"id"`
	Goal       string  `json:"goal"`
	StrategyID string  `json:"strategyId"`
	Confidence float64 `json:"confidence"`
	Complexity string  `json:"complexity"`
	Risk       string  `json:"risk"`
	CreatedAt  int64   `json:"createdAt"`
	Success    *bool   `json:"success,omitempty"`
}

// OrchestratorHistoryResult is returned by phantom_orchestrator_history.
type OrchestratorHistoryResult struct {
	Decisions []OrchestratorDecision `json:"decisions"`
	Count     int                    `json:"count"`
}

// OrchestratorStrategy is one entry in phantom_orchestrator_strategies.
// Wire shape mirrors v1 handlers.ts:handleOrchestratorStrategies.
type OrchestratorStrategy struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Enabled     bool   `json:"enabled"`
	Description string `json:"description"`
}

// OrchestratorStrategiesResult is returned by phantom_orchestrator_strategies.
type OrchestratorStrategiesResult struct {
	Strategies []OrchestratorStrategy `json:"strategies"`
}

// NotImplementedResult is returned for tools the v2 backend does not yet provide.
type NotImplementedResult struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}
