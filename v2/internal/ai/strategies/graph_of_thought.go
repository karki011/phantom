// Package strategies provides AI prompt enhancement strategies.
// GraphOfThoughtStrategy decomposes a goal into thought nodes (analyze →
// implement-core / implement-peripheral → integrate → verify) with explicit
// dependencies, then surfaces a topological execution order with parallel
// groups. v1 used the same deterministic decomposition and topological sort —
// no LLM call was made — so this port is a faithful 1:1.
//
// Author: Subash Karki
package strategies

import (
	"fmt"
	"sort"
	"strings"
)

// GraphOfThoughtStrategy decomposes complex tasks into a thought graph.
type GraphOfThoughtStrategy struct{}

// NewGraphOfThoughtStrategy creates a GraphOfThoughtStrategy.
func NewGraphOfThoughtStrategy() *GraphOfThoughtStrategy { return &GraphOfThoughtStrategy{} }

// ID returns the unique identifier for this strategy.
func (g *GraphOfThoughtStrategy) ID() string { return "graph-of-thought" }

// Name returns a human-readable name.
func (g *GraphOfThoughtStrategy) Name() string { return "Graph of Thoughts" }

// Description returns a brief explanation of what this strategy does.
func (g *GraphOfThoughtStrategy) Description() string {
	return "Graph-structured reasoning for complex interconnected problems. Decomposes into thought nodes with dependency edges."
}

// ShouldActivate scores how strongly this strategy fits the task.
// Mirrors v1: critical complexity → 0.9, complex+large blast → 0.85,
// complex unambiguous → 0.7, moderate+huge blast → 0.6.
func (g *GraphOfThoughtStrategy) ShouldActivate(t TaskAssessment) (float64, string) {
	switch {
	case t.Complexity == Critical:
		return 0.9, "Critical complexity — graph-of-thought decomposition strongly recommended"
	case t.Complexity == Complex && t.BlastRadius > 10:
		return 0.85, fmt.Sprintf("Complex task with large blast radius (%d files) — graph decomposition recommended", t.BlastRadius)
	case t.Complexity == Complex && !t.IsAmbiguous:
		return 0.7, "Complex task with clear requirements — graph decomposition can parallelize subtasks"
	case t.Complexity == Moderate && t.BlastRadius > 15:
		return 0.6, fmt.Sprintf("Moderate complexity but large blast radius (%d files) — graph decomposition may help", t.BlastRadius)
	default:
		return 0.05, "Simple or small-scope task — graph decomposition not needed"
	}
}

// Enrich emits a topologically-sorted execution plan with parallel groups.
func (g *GraphOfThoughtStrategy) Enrich(message string, t TaskAssessment, graphCtx string) string {
	nodes := decomposeGraph(t)
	order := topologicalSort(nodes)
	groups := identifyParallelGroups(nodes, order)

	var groupLines []string
	for i, group := range groups {
		groupLines = append(groupLines, fmt.Sprintf("  Step %d (parallel): %s", i+1, strings.Join(group, ", ")))
	}

	guidance := fmt.Sprintf(`<strategy-guidance kind="graph-of-thought">
Task profile: complexity=%s, risk=%s, blastRadius=%d
Decomposed into %d thought nodes; %d sequential steps.
Execution plan:
%s
Synthesis: %s
%s</strategy-guidance>

%s`, t.Complexity, t.Risk, t.BlastRadius, len(nodes), len(groups),
		strings.Join(groupLines, "\n"),
		fmt.Sprintf("Order: %s", strings.Join(order, " -> ")),
		graphCtx, message)
	return guidance
}

// thoughtNode is one decomposition step.
type thoughtNode struct {
	id           string
	description  string
	dependencies []string
}

// decomposeGraph builds the v1 fixed decomposition. v2 has no per-file
// relevance signal at strategy time (the orchestrator owns the graph), so we
// always emit analyze → implement-core → integrate → verify with conservative
// defaults that match v1's most common shape.
func decomposeGraph(t TaskAssessment) []thoughtNode {
	nodes := []thoughtNode{
		{id: "analyze", description: "Analyze requirements and surface assumptions"},
		{id: "implement-core", description: "Implement the primary change", dependencies: []string{"analyze"}},
	}
	if t.BlastRadius > 0 {
		nodes = append(nodes, thoughtNode{
			id:           "implement-peripheral",
			description:  "Update peripheral files for consistency",
			dependencies: []string{"analyze"},
		})
	}
	integrateDeps := []string{"implement-core"}
	if t.BlastRadius > 0 {
		integrateDeps = append(integrateDeps, "implement-peripheral")
	}
	nodes = append(nodes, thoughtNode{
		id:           "integrate",
		description:  "Verify integration points between changed files",
		dependencies: integrateDeps,
	})
	nodes = append(nodes, thoughtNode{
		id:           "verify",
		description:  "Run tests / type checks; confirm changes are complete",
		dependencies: []string{"integrate"},
	})
	return nodes
}

// topologicalSort returns node IDs in dependency order. Cycle-safe (skips
// re-entered nodes) — mirrors v1's wouldCreateCycle/topo logic.
func topologicalSort(nodes []thoughtNode) []string {
	visited := make(map[string]bool)
	visiting := make(map[string]bool)
	var order []string

	byID := make(map[string]thoughtNode, len(nodes))
	for _, n := range nodes {
		byID[n.id] = n
	}

	var visit func(id string)
	visit = func(id string) {
		if visited[id] || visiting[id] {
			return
		}
		visiting[id] = true
		for _, dep := range byID[id].dependencies {
			visit(dep)
		}
		visiting[id] = false
		visited[id] = true
		order = append(order, id)
	}

	// Stable iteration: visit in declared order so output is deterministic.
	for _, n := range nodes {
		visit(n.id)
	}
	return order
}

// identifyParallelGroups groups nodes by dependency depth — nodes at the same
// depth can run concurrently.
func identifyParallelGroups(nodes []thoughtNode, order []string) [][]string {
	depth := make(map[string]int)
	byID := make(map[string]thoughtNode, len(nodes))
	for _, n := range nodes {
		byID[n.id] = n
	}
	for _, id := range order {
		n := byID[id]
		if len(n.dependencies) == 0 {
			depth[id] = 0
			continue
		}
		max := 0
		for _, dep := range n.dependencies {
			if d := depth[dep]; d > max {
				max = d
			}
		}
		depth[id] = max + 1
	}

	byDepth := make(map[int][]string)
	for id, d := range depth {
		byDepth[d] = append(byDepth[d], id)
	}
	depths := make([]int, 0, len(byDepth))
	for d := range byDepth {
		depths = append(depths, d)
	}
	sort.Ints(depths)

	out := make([][]string, 0, len(depths))
	for _, d := range depths {
		group := byDepth[d]
		sort.Strings(group)
		out = append(out, group)
	}
	return out
}
