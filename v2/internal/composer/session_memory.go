// Author: Subash Karki
//
// session_memory.go assembles a structured memory block for injection into the
// Claude system prompt at session start. It queries knowledge stores (decisions,
// global patterns, file graph) and formats the results into a <phantom-memory>
// XML block that gives Claude orientation and proven patterns from past sessions.
//
// All queries are SQLite-backed and complete in <50ms. The builder gracefully
// degrades when any knowledge store is nil — it simply skips that section.
package composer

import (
	"fmt"
	"sort"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
)

// MaxSessionMemoryBytes is the hard cap on the session memory block size.
// 4KB ≈ 1000 tokens — negligible context window impact, fits in prompt cache.
const MaxSessionMemoryBytes = 4000

// SessionMemoryBuilder assembles a memory context block from knowledge stores.
// Each field is optional — nil stores are silently skipped.
type SessionMemoryBuilder struct {
	Decisions      *knowledge.DecisionStore
	GlobalPatterns *knowledge.GlobalPatternStore
	Indexer        *filegraph.Indexer
	MaxBytes       int // 0 means MaxSessionMemoryBytes
}

// Build assembles the memory block, respecting the byte budget.
// Sections are added in priority order — lower-priority sections are dropped
// first when the budget is exhausted. Returns empty string when no meaningful
// memory is available.
func (b *SessionMemoryBuilder) Build() string {
	maxBytes := b.MaxBytes
	if maxBytes <= 0 {
		maxBytes = MaxSessionMemoryBytes
	}

	// Collect sections in priority order (highest first).
	type section struct {
		content  string
		priority int // higher = more important
	}
	var sections []section

	// Tier 1 — Always included.
	if s := b.graphStats(); s != "" {
		sections = append(sections, section{content: s, priority: 100})
	}
	if s := b.provenPatterns(); s != "" {
		sections = append(sections, section{content: s, priority: 90})
	}

	// Tier 2 — High value.
	if s := b.recentFailures(); s != "" {
		sections = append(sections, section{content: s, priority: 80})
	}
	if s := b.globalPatterns(); s != "" {
		sections = append(sections, section{content: s, priority: 70})
	}

	// Tier 3 — Nice to have.
	if s := b.decisionSummary(); s != "" {
		sections = append(sections, section{content: s, priority: 60})
	}

	if len(sections) == 0 {
		return ""
	}

	// Sort by priority descending so highest-priority sections are first.
	sort.Slice(sections, func(i, j int) bool {
		return sections[i].priority > sections[j].priority
	})

	// Assemble with budget enforcement. The wrapper tags consume some bytes.
	wrapper := "<phantom-memory>\n%s</phantom-memory>"
	wrapperOverhead := len(wrapper) - 2 // subtract %s placeholder
	budget := maxBytes - wrapperOverhead

	var included []string
	for _, s := range sections {
		cost := len(s.content) + 2 // +2 for "\n\n" separator
		if cost > budget {
			continue // skip this section, try smaller ones
		}
		included = append(included, s.content)
		budget -= cost
	}

	if len(included) == 0 {
		return ""
	}

	body := strings.Join(included, "\n\n") + "\n"
	return fmt.Sprintf(wrapper, body)
}

// graphStats returns file graph statistics for project orientation.
// Priority: Tier 1 (~200 bytes).
func (b *SessionMemoryBuilder) graphStats() string {
	if b.Indexer == nil {
		return ""
	}
	fileCount, symbolCount, edgeCount := b.Indexer.Graph().Stats()
	if fileCount == 0 {
		return ""
	}
	return fmt.Sprintf("## Project Graph\n%d files, %d symbols, %d dependency edges.",
		fileCount, symbolCount, edgeCount)
}

// provenPatterns returns the top 5 strategy patterns with highest success rates
// for the current project. Priority: Tier 1 (~1KB).
func (b *SessionMemoryBuilder) provenPatterns() string {
	if b.Decisions == nil {
		return ""
	}
	recent, err := b.Decisions.ListRecent(30)
	if err != nil || len(recent) == 0 {
		return ""
	}

	// Aggregate by (strategy, complexity) pair.
	type key struct {
		strategy   string
		complexity string
	}
	type stats struct {
		rate  float64
		count int
		risk  string
	}
	agg := make(map[key]*stats)

	for _, d := range recent {
		k := key{strategy: d.StrategyID, complexity: d.Complexity}
		if _, ok := agg[k]; ok {
			continue // already queried this pair
		}
		rate, count, err := b.Decisions.GetSuccessRate(d.StrategyID, d.Complexity)
		if err != nil || count == 0 {
			continue
		}
		agg[k] = &stats{rate: rate, count: count, risk: d.Risk}
	}

	if len(agg) == 0 {
		return ""
	}

	// Sort by success rate descending, take top 5.
	type entry struct {
		k key
		s *stats
	}
	var entries []entry
	for k, s := range agg {
		entries = append(entries, entry{k: k, s: s})
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].s.rate > entries[j].s.rate
	})
	limit := 5
	if len(entries) < limit {
		limit = len(entries)
	}

	var lines []string
	for _, e := range entries[:limit] {
		lines = append(lines, fmt.Sprintf("- %s/%s → \"%s\" (%.0f%% success, %d uses)",
			e.k.complexity, e.s.risk, e.k.strategy, e.s.rate*100, e.s.count))
	}

	return "## Proven Patterns (this project)\n" + strings.Join(lines, "\n")
}

// recentFailures shows strategies that failed recently so Claude can avoid them.
// Priority: Tier 2 (~500 bytes).
func (b *SessionMemoryBuilder) recentFailures() string {
	if b.Decisions == nil {
		return ""
	}
	recent, err := b.Decisions.ListRecent(20)
	if err != nil || len(recent) == 0 {
		return ""
	}

	var lines []string
	for _, d := range recent {
		rate, count, err := b.Decisions.GetSuccessRate(d.StrategyID, d.Complexity)
		if err != nil || count == 0 {
			continue
		}
		// Only include strategies with <50% success rate.
		if rate >= 0.5 {
			continue
		}
		goal := d.Goal
		if len(goal) > 60 {
			goal = goal[:57] + "..."
		}
		lines = append(lines, fmt.Sprintf("- \"%s\" → %s FAILED (%.0f%% success)",
			goal, d.StrategyID, rate*100))
		if len(lines) >= 5 {
			break
		}
	}

	if len(lines) == 0 {
		return ""
	}
	return "## Recent Failures to Avoid\n" + strings.Join(lines, "\n")
}

// globalPatterns returns cross-project patterns from the GlobalPatternStore.
// Priority: Tier 2 (~500 bytes).
func (b *SessionMemoryBuilder) globalPatterns() string {
	if b.GlobalPatterns == nil {
		return ""
	}
	all := b.GlobalPatterns.GetAll()
	if len(all) == 0 {
		return ""
	}

	// Sort by success rate descending.
	sort.Slice(all, func(i, j int) bool {
		return all[i].SuccessRate > all[j].SuccessRate
	})

	limit := 5
	if len(all) < limit {
		limit = len(all)
	}

	var lines []string
	for _, p := range all[:limit] {
		lines = append(lines, fmt.Sprintf("- %s/%s → \"%s\" (%.0f%% across %d projects)",
			p.Complexity, p.Risk, p.StrategyID, p.SuccessRate*100, p.ProjectCount))
	}

	return "## Cross-Project Patterns\n" + strings.Join(lines, "\n")
}

// decisionSummary shows a brief count of recent decisions by strategy.
// Priority: Tier 3 (~500 bytes).
func (b *SessionMemoryBuilder) decisionSummary() string {
	if b.Decisions == nil {
		return ""
	}
	recent, err := b.Decisions.ListRecent(10)
	if err != nil || len(recent) == 0 {
		return ""
	}

	counts := make(map[string]int)
	for _, d := range recent {
		counts[d.StrategyID]++
	}

	var parts []string
	for strategy, count := range counts {
		parts = append(parts, fmt.Sprintf("%d %s", count, strategy))
	}
	// Sort for deterministic output.
	sort.Strings(parts)

	return fmt.Sprintf("## Decision Summary\nLast %d decisions: %s",
		len(recent), strings.Join(parts, ", "))
}
