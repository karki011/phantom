// MCP tool handler implementations.
// Each handler is a thin wrapper around v2 packages (graph, knowledge, db).
// Tools that have no v2 equivalent yet return a clear "not_implemented"
// payload so the contract is preserved while the backend catches up.
//
// Author: Subash Karki
package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"

	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
	"github.com/subashkarki/phantom-os-v2/internal/ai/orchestrator"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
	"github.com/subashkarki/phantom-os-v2/internal/db"
)

// IndexerProvider returns the indexer backing a given project, or nil when
// no indexer is running. This decouples the MCP server from app.App so the
// stdio binary can pick up an indexer without a Wails dependency.
type IndexerProvider interface {
	GetIndexer(projectID string) *filegraph.Indexer
}

// BuildController owns indexer lifecycle for the standalone binary so
// phantom_graph_build and phantom_task_status can drive a real build.
// The Wails app does not need to implement this — its indexers are managed
// elsewhere and HandleBuild gracefully reports "ready" when one is already
// running for the requested project.
type BuildController interface {
	Build(ctx context.Context, projectID, repoPath string) (startedAt time.Time, alreadyRunning bool, err error)
	Status(projectID string) (state BuildState, startedAt, finishedAt time.Time, errMsg string)
}

// Deps wires the MCP handlers to v2 services.
type Deps struct {
	Queries   *db.Queries
	Indexers  IndexerProvider
	Builder   BuildController
	V1Bridge  *knowledge.V1Bridge
	ProjectID string

	// Optional learning-loop components. When set, orchestrator Process calls
	// read past decisions, apply auto-tune + performance + global-pattern bias,
	// and persist a new decision after each run. When nil, Process degrades to
	// a stateless run.
	Decisions      *knowledge.DecisionStore
	Performance    *strategies.PerformanceStore
	AutoTune       *strategies.ThresholdTracker
	GlobalPatterns *knowledge.GlobalPatternStore
	GapDetector    *strategies.GapDetector
	Compactor      *knowledge.Compactor
}

// jsonResult marshals payload to a TextContent CallToolResult that mirrors
// v1's `{ content: [{ type: 'text', text: <json> }] }` envelope.
func jsonResult(payload any) (*mcp.CallToolResult, error) {
	b, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return mcp.NewToolResultErrorf("marshal: %v", err), nil
	}
	return mcp.NewToolResultText(string(b)), nil
}

// errorResult mirrors v1's `{ error: msg }` text payload with isError=true.
func errorResult(msg string) (*mcp.CallToolResult, error) {
	body, _ := json.Marshal(map[string]string{"error": msg})
	return mcp.NewToolResultError(string(body)), nil
}

// notImplemented returns a stub for tools that have no v2 backend yet.
func notImplemented(tool, reason string) (*mcp.CallToolResult, error) {
	return jsonResult(NotImplementedResult{
		Error:   "not_implemented",
		Message: tool + ": " + reason,
	})
}

// resolveProjectID returns the request projectId, falling back to the scoped
// default. Empty string means no project context.
func (d *Deps) resolveProjectID(req mcp.CallToolRequest) string {
	if id := req.GetString("projectId", ""); id != "" {
		return id
	}
	return d.ProjectID
}

// indexerFor returns the indexer for a project or nil if missing.
func (d *Deps) indexerFor(projectID string) *filegraph.Indexer {
	if d.Indexers == nil || projectID == "" {
		return nil
	}
	return d.Indexers.GetIndexer(projectID)
}

// HandleGraphContext: phantom_graph_context — files related to one file.
func (d *Deps) HandleGraphContext(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pid := d.resolveProjectID(req)
	file, err := req.RequireString("file")
	if err != nil {
		return errorResult(err.Error())
	}
	depth := req.GetInt("depth", 2)

	ix := d.indexerFor(pid)
	if ix == nil {
		return errorResult("Project graph not found. Build the graph first.")
	}
	neighbors := ix.Graph().Neighbors(file, depth)

	files := make([]FileRef, 0, len(neighbors))
	for i, n := range neighbors {
		// Score decays with neighbor index — we don't have true relevance scores
		// in v2's filegraph yet, so this gives stable, sensible ordering.
		score := math.Max(0.1, 1.0-float64(i)*0.05)
		files = append(files, FileRef{Path: n.Path, Relevance: score})
	}
	return jsonResult(GraphContextResult{
		Files:   files,
		Edges:   nil,
		Modules: nil,
	})
}

// HandleBlastRadius: phantom_graph_blast_radius — what breaks if file changes.
func (d *Deps) HandleBlastRadius(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pid := d.resolveProjectID(req)
	file, err := req.RequireString("file")
	if err != nil {
		return errorResult(err.Error())
	}

	ix := d.indexerFor(pid)
	if ix == nil {
		return errorResult("Project graph not found. Build the graph first.")
	}
	g := ix.Graph()

	node := g.Get(file)
	if node == nil {
		return jsonResult(BlastRadiusResult{
			DirectlyAffected:     []string{},
			TransitivelyAffected: []string{},
			ImpactScore:          0,
		})
	}

	directSet := make(map[string]struct{})
	for _, p := range node.ImportedBy {
		directSet[p] = struct{}{}
	}

	// Transitive importers — BFS up the reverse graph.
	transitiveSet := make(map[string]struct{})
	frontier := append([]string{}, node.ImportedBy...)
	for len(frontier) > 0 {
		next := frontier[:0]
		for _, p := range frontier {
			n := g.Get(p)
			if n == nil {
				continue
			}
			for _, up := range n.ImportedBy {
				if _, seen := directSet[up]; seen {
					continue
				}
				if _, seen := transitiveSet[up]; seen {
					continue
				}
				transitiveSet[up] = struct{}{}
				next = append(next, up)
			}
		}
		frontier = append([]string(nil), next...)
	}

	totalFiles, _, _ := g.Stats()
	impactScore := 0.0
	if totalFiles > 0 {
		impactScore = float64(len(directSet)+len(transitiveSet)) / float64(totalFiles)
		if impactScore > 1 {
			impactScore = 1
		}
	}

	return jsonResult(BlastRadiusResult{
		DirectlyAffected:     toSortedSlice(directSet),
		TransitivelyAffected: toSortedSlice(transitiveSet),
		ImpactScore:          impactScore,
	})
}

// HandleRelated: phantom_graph_related — files involved in a feature.
func (d *Deps) HandleRelated(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pid := d.resolveProjectID(req)
	files, err := req.RequireStringSlice("files")
	if err != nil {
		return errorResult(err.Error())
	}
	depth := req.GetInt("depth", 1)

	ix := d.indexerFor(pid)
	if ix == nil {
		return errorResult("Project graph not found. Build the graph first.")
	}
	g := ix.Graph()

	seen := make(map[string]struct{})
	for _, f := range files {
		seen[f] = struct{}{}
	}
	related := make(map[string]struct{})
	for _, f := range files {
		for _, n := range g.Neighbors(f, depth) {
			if _, ok := seen[n.Path]; ok {
				continue
			}
			related[n.Path] = struct{}{}
		}
	}
	return jsonResult(RelatedResult{RelatedFiles: toSortedSlice(related)})
}

// HandleStats: phantom_graph_stats — graph health/coverage.
func (d *Deps) HandleStats(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pid := d.resolveProjectID(req)
	ix := d.indexerFor(pid)
	if ix == nil {
		return errorResult("Project graph not found. Build the graph first.")
	}
	files, _, edges := ix.Graph().Stats()
	total := ix.TotalSourceFiles()
	coverage := 0.0
	if total > 0 {
		coverage = float64(files) / float64(total)
	}
	return jsonResult(StatsResult{
		Files:       files,
		Edges:       edges,
		Modules:     0,
		Coverage:    coverage,
		LastBuiltAt: time.Now().UnixMilli(),
	})
}

// HandlePath: phantom_graph_path — shortest path between two files.
func (d *Deps) HandlePath(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pid := d.resolveProjectID(req)
	from, err := req.RequireString("from")
	if err != nil {
		return errorResult(err.Error())
	}
	to, err := req.RequireString("to")
	if err != nil {
		return errorResult(err.Error())
	}

	ix := d.indexerFor(pid)
	if ix == nil {
		return errorResult("Project graph not found. Build the graph first.")
	}
	g := ix.Graph()

	if g.Get(from) == nil || g.Get(to) == nil {
		return jsonResult(PathResult{Path: []string{}, Length: 0})
	}

	// BFS on the undirected dependency graph.
	prev := map[string]string{from: ""}
	queue := []string{from}
	found := false
	for len(queue) > 0 && !found {
		cur := queue[0]
		queue = queue[1:]
		node := g.Get(cur)
		if node == nil {
			continue
		}
		neighbors := append([]string{}, node.Imports...)
		neighbors = append(neighbors, node.ImportedBy...)
		for _, n := range neighbors {
			if _, seen := prev[n]; seen {
				continue
			}
			prev[n] = cur
			if n == to {
				found = true
				break
			}
			queue = append(queue, n)
		}
	}

	if !found {
		return jsonResult(PathResult{Path: []string{}, Length: 0})
	}
	// Walk backwards from `to`.
	var path []string
	for cur := to; cur != ""; cur = prev[cur] {
		path = append([]string{cur}, path...)
		if cur == from {
			break
		}
	}
	return jsonResult(PathResult{Path: path, Length: len(path)})
}

// HandleBuild: phantom_graph_build — kick off a graph build asynchronously.
// Returns immediately with `{ projectId, status: "building", startedAt }`.
// Clients poll phantom_task_status to know when it's `ready`.
func (d *Deps) HandleBuild(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pid := d.resolveProjectID(req)
	if pid == "" {
		return errorResult("projectId is required")
	}

	// If we have no builder (e.g. running embedded in Wails) but an indexer
	// is already up, reuse v1's "ready" semantic.
	if d.Builder == nil {
		if ix := d.indexerFor(pid); ix != nil {
			started := time.Now().UnixMilli()
			return jsonResult(BuildResult{
				ProjectID: pid,
				Status:    "ready",
				StartedAt: started,
				Message:   "Indexer already running for " + pid,
			})
		}
		return notImplemented("phantom_graph_build",
			"build controller not wired in this MCP host")
	}

	if d.Queries == nil {
		return errorResult("database not available")
	}
	project, err := d.Queries.GetProject(ctx, pid)
	if err != nil {
		return errorResult("project not found: " + err.Error())
	}

	startedAt, alreadyRunning, err := d.Builder.Build(ctx, pid, project.RepoPath)
	if err != nil {
		return errorResult(err.Error())
	}
	msg := "Graph build started for " + pid
	if alreadyRunning {
		msg = "Graph build already in progress for " + pid
	}
	return jsonResult(BuildResult{
		ProjectID: pid,
		Status:    "building",
		StartedAt: startedAt.UnixMilli(),
		Message:   msg,
	})
}

// HandleTaskStatus: phantom_task_status — poll graph build lifecycle.
// Prefers the builder's tracked state (idle/building/ready/error with
// timestamps); falls back to inferring from a bare indexer.
func (d *Deps) HandleTaskStatus(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pid := d.resolveProjectID(req)

	if d.Builder != nil {
		state, started, finished, errMsg := d.Builder.Status(pid)
		out := TaskStatusResult{ProjectID: pid, Status: string(state)}
		if !started.IsZero() {
			out.StartedAt = started.UnixMilli()
		}
		if !finished.IsZero() {
			out.FinishedAt = finished.UnixMilli()
			if !started.IsZero() {
				out.DurationMs = finished.Sub(started).Milliseconds()
			}
		}
		if errMsg != "" {
			out.Error = errMsg
		}
		return jsonResult(out)
	}

	ix := d.indexerFor(pid)
	if ix == nil {
		return jsonResult(TaskStatusResult{ProjectID: pid, Status: "idle"})
	}
	status := "ready"
	if ix.IsIndexing() {
		status = "building"
	}
	return jsonResult(TaskStatusResult{ProjectID: pid, Status: status})
}

// HandleListProjects: phantom_list_projects — enumerate v2 projects.
func (d *Deps) HandleListProjects(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if d.Queries == nil {
		return errorResult("database not available")
	}
	rows, err := d.Queries.ListProjects(ctx)
	if err != nil {
		return errorResult(err.Error())
	}
	items := make([]ProjectListItem, 0, len(rows))
	for _, p := range rows {
		items = append(items, ProjectListItem{
			ID:       p.ID,
			Name:     p.Name,
			RepoPath: p.RepoPath,
		})
	}
	return jsonResult(ProjectListResult{Projects: items})
}

// HandleEvaluateOutput: phantom_evaluate_output — heuristic quality scoring.
// Direct port of v1 handlers.ts:handleEvaluateOutput so scores stay stable.
func (d *Deps) HandleEvaluateOutput(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	goal, err := req.RequireString("goal")
	if err != nil {
		return errorResult(err.Error())
	}
	output, err := req.RequireString("output")
	if err != nil {
		return errorResult(err.Error())
	}

	if strings.TrimSpace(output) == "" {
		return jsonResult(EvaluateResult{
			Confidence: 0,
			Feedback:   "Empty output — no content to evaluate.",
		})
	}

	confidence := 0.5
	var feedback []string

	// Signal 1: word count.
	words := strings.Fields(output)
	switch {
	case len(words) < 10:
		confidence -= 0.15
		feedback = append(feedback, "Output is very short — may lack detail.")
	case len(words) > 50:
		confidence += 0.1
		feedback = append(feedback, "Output has good depth.")
	}

	// Signal 2: goal-keyword overlap (>3 chars).
	var goalTokens []string
	for _, w := range strings.Fields(strings.ToLower(goal)) {
		if len(w) > 3 {
			goalTokens = append(goalTokens, w)
		}
	}
	outputLower := strings.ToLower(output)
	matches := 0
	for _, w := range goalTokens {
		if strings.Contains(outputLower, w) {
			matches++
		}
	}
	overlap := 0.0
	if len(goalTokens) > 0 {
		overlap = float64(matches) / float64(len(goalTokens))
	}
	switch {
	case overlap > 0.5:
		confidence += 0.15
		feedback = append(feedback, "Output aligns well with goal keywords.")
	case overlap < 0.2:
		confidence -= 0.1
		feedback = append(feedback, "Output has low keyword overlap with the goal — may be off-topic.")
	}

	// Signal 3: structural indicators.
	hasCodeBlock := strings.Contains(output, "```")
	hasFilePaths := regexp.MustCompile(`[\w/\-]+\.\w{1,5}`).MatchString(output)
	hasListItems := regexp.MustCompile(`(?m)^[-*•]\s`).MatchString(output)
	if hasCodeBlock || hasFilePaths {
		confidence += 0.1
		feedback = append(feedback, "Output contains concrete references (code/files).")
	}
	if hasListItems {
		confidence += 0.05
		feedback = append(feedback, "Output is well-structured with list items.")
	}

	// Clamp + round to 2 decimals.
	confidence = math.Max(0, math.Min(1, math.Round(confidence*100)/100))

	fb := strings.Join(feedback, " ")
	if fb == "" {
		fb = "No strong quality signals detected."
	}
	return jsonResult(EvaluateResult{
		Confidence: confidence,
		Feedback:   fb,
		Note:       "Heuristic evaluation — Sampling not used. Use Claude judgment for nuanced assessment.",
	})
}

// HandleBeforeEdit: phantom_before_edit — composite (context + blast + related).
func (d *Deps) HandleBeforeEdit(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pid := d.resolveProjectID(req)
	files, err := req.RequireStringSlice("files")
	if err != nil {
		return errorResult(err.Error())
	}

	ix := d.indexerFor(pid)
	if ix == nil {
		return errorResult("Project graph not found. Build the graph first.")
	}
	g := ix.Graph()

	// Aggregate context (unique file refs by best score).
	scores := make(map[string]float64)
	for _, f := range files {
		neighbors := g.Neighbors(f, 2)
		for i, n := range neighbors {
			s := math.Max(0.1, 1.0-float64(i)*0.05)
			if cur, ok := scores[n.Path]; !ok || s > cur {
				scores[n.Path] = s
			}
		}
	}
	contextFiles := make([]FileRef, 0, len(scores))
	for path, s := range scores {
		contextFiles = append(contextFiles, FileRef{Path: path, Relevance: s})
	}
	sort.Slice(contextFiles, func(i, j int) bool {
		return contextFiles[i].Relevance > contextFiles[j].Relevance
	})

	// Aggregate blast radius (union direct + transitive across all files).
	directSet := make(map[string]struct{})
	transitiveSet := make(map[string]struct{})
	maxImpact := 0.0
	totalFiles, _, _ := g.Stats()
	for _, f := range files {
		node := g.Get(f)
		if node == nil {
			continue
		}
		for _, p := range node.ImportedBy {
			directSet[p] = struct{}{}
		}
		frontier := append([]string{}, node.ImportedBy...)
		local := make(map[string]struct{})
		for len(frontier) > 0 {
			next := frontier[:0]
			for _, p := range frontier {
				n := g.Get(p)
				if n == nil {
					continue
				}
				for _, up := range n.ImportedBy {
					if _, ok := directSet[up]; ok {
						continue
					}
					if _, ok := local[up]; ok {
						continue
					}
					local[up] = struct{}{}
					transitiveSet[up] = struct{}{}
					next = append(next, up)
				}
			}
			frontier = append([]string(nil), next...)
		}
		if totalFiles > 0 {
			impact := float64(len(node.ImportedBy)+len(local)) / float64(totalFiles)
			if impact > maxImpact {
				maxImpact = impact
			}
		}
	}

	// Related files (depth 1).
	excluded := make(map[string]struct{}, len(files))
	for _, f := range files {
		excluded[f] = struct{}{}
	}
	related := make(map[string]struct{})
	for _, f := range files {
		for _, n := range g.Neighbors(f, 1) {
			if _, ok := excluded[n.Path]; ok {
				continue
			}
			related[n.Path] = struct{}{}
		}
	}

	return jsonResult(BeforeEditResult{
		Context: GraphContextResult{
			Files:   contextFiles,
			Edges:   nil,
			Modules: nil,
		},
		BlastRadius: BlastRadiusResult{
			DirectlyAffected:     toSortedSlice(directSet),
			TransitivelyAffected: toSortedSlice(transitiveSet),
			ImpactScore:          maxImpact,
		},
		RelatedFiles: toSortedSlice(related),
	})
}

// HandleOrchestratorProcess: phantom_orchestrator_process — strategy pipeline.
// Routes a goal through v2's stateless orchestrator (assess -> select ->
// enrich) and returns a v1-compatible result.
func (d *Deps) HandleOrchestratorProcess(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pid := d.resolveProjectID(req)
	goal, err := req.RequireString("goal")
	if err != nil {
		return errorResult(err.Error())
	}
	activeFiles := req.GetStringSlice("activeFiles", nil)

	hints := orchestrator.Hints{}
	if raw := req.GetArguments(); raw != nil {
		if h, ok := raw["hints"].(map[string]any); ok {
			if v, ok := h["isAmbiguous"].(bool); ok {
				hints.IsAmbiguous = v
			}
			if v, ok := h["isCritical"].(bool); ok {
				hints.IsCritical = v
			}
			if v, ok := h["estimatedComplexity"].(string); ok {
				hints.EstimatedComplexity = v
			}
		}
	}

	deps := orchestrator.Dependencies{
		Indexer:        d.indexerFor(pid),
		Decisions:      d.Decisions,
		Performance:    d.Performance,
		AutoTune:       d.AutoTune,
		GlobalPatterns: d.GlobalPatterns,
		GapDetector:    d.GapDetector,
		Compactor:      d.Compactor,
	}
	result, err := orchestrator.Process(ctx, deps, orchestrator.ProcessInput{
		ProjectID:   pid,
		Goal:        goal,
		ActiveFiles: activeFiles,
		Hints:       hints,
	})
	if err != nil {
		return errorResult(err.Error())
	}
	return jsonResult(result)
}

// HandleOrchestratorStrategies: phantom_orchestrator_strategies — list all
// registered reasoning strategies with metadata. Wire shape mirrors v1
// handlers.ts:handleOrchestratorStrategies — `{ strategies: [{ id, name,
// enabled, description }] }`. The v2 registry is built from the same 7
// constructors as orchestrator.defaultRegistry, so the list stays in sync.
func (d *Deps) HandleOrchestratorStrategies(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	reg := strategies.NewRegistry()
	reg.Register(strategies.NewDirectStrategy(), 10)
	reg.Register(strategies.NewDecomposeStrategy(), 5)
	reg.Register(strategies.NewAdvisorStrategy(), 6)
	reg.Register(strategies.NewSelfRefineStrategy(), 4)
	reg.Register(strategies.NewTreeOfThoughtStrategy(), 3)
	reg.Register(strategies.NewDebateStrategy(), 7)
	reg.Register(strategies.NewGraphOfThoughtStrategy(), 8)

	infos := reg.GetAll()
	out := make([]OrchestratorStrategy, 0, len(infos))
	for _, s := range infos {
		out = append(out, OrchestratorStrategy{
			ID:          s.ID,
			Name:        s.Name,
			Enabled:     s.Enabled,
			Description: s.Description,
		})
	}
	return jsonResult(OrchestratorStrategiesResult{Strategies: out})
}

// HandleOrchestratorHistory: phantom_orchestrator_history — past decisions.
// Prefers v2's decision store when populated; falls back to v1 per-project DBs
// via knowledge.V1Bridge so legacy data stays visible during migration.
func (d *Deps) HandleOrchestratorHistory(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pid := d.resolveProjectID(req)
	limit := req.GetInt("limit", 20)
	if limit <= 0 {
		limit = 20
	}

	// Prefer v2 decisions when the store is wired and has data.
	if d.Decisions != nil {
		if rows, err := d.Decisions.ListRecent(limit); err == nil && len(rows) > 0 {
			out := make([]OrchestratorDecision, 0, len(rows))
			for _, r := range rows {
				out = append(out, OrchestratorDecision{
					ID:         r.ID,
					Goal:       r.Goal,
					StrategyID: r.StrategyID,
					Confidence: r.Confidence,
					Complexity: r.Complexity,
					Risk:       r.Risk,
					CreatedAt:  r.CreatedAt.UnixMilli(),
				})
			}
			return jsonResult(OrchestratorHistoryResult{Decisions: out, Count: len(out)})
		}
	}

	// Fall back to v1 per-project bridge.
	if pid == "" || d.V1Bridge == nil {
		return jsonResult(OrchestratorHistoryResult{Decisions: []OrchestratorDecision{}, Count: 0})
	}
	rows, err := d.V1Bridge.ReadV1Decisions(pid, limit)
	if err != nil {
		return errorResult(err.Error())
	}
	out := make([]OrchestratorDecision, 0, len(rows))
	for _, r := range rows {
		out = append(out, OrchestratorDecision{
			ID:         r.ID,
			Goal:       r.Goal,
			StrategyID: r.StrategyID,
			Confidence: r.Confidence,
			Complexity: r.Complexity,
			Risk:       r.Risk,
			CreatedAt:  r.CreatedAt.UnixMilli(),
		})
	}
	return jsonResult(OrchestratorHistoryResult{Decisions: out, Count: len(out)})
}

// toSortedSlice converts a set to a deterministic sorted slice.
func toSortedSlice(set map[string]struct{}) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// ensure the errors import is referenced even on builds that don't hit it
var _ = errors.New
