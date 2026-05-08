// Author: Subash Karki
//
// enrichment.go — parallel enrichment pipeline that collects context from
// multiple sources (editor, strategy, graph, memory) within a per-turn
// timeout budget. Each source produces XML fragments and chip events.
package composer

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode"
)

// maxTokenBudget is the approximate token ceiling for the assembled
// <phantom-context> block. Sources are included in priority order until
// the budget is exhausted.
const maxTokenBudget = 1200

// CollectorFunc is a function that gathers enrichment data from a single
// source. It must respect ctx cancellation and return partial results on
// timeout rather than blocking indefinitely.
type CollectorFunc func(ctx context.Context, input EnrichmentInput) collectorResult

// EnrichmentPipeline runs all configured collectors in parallel with a
// shared timeout, then assembles the results into a single XML block and
// a set of ChipEvents for the frontend.
type EnrichmentPipeline struct {
	Timeout           time.Duration
	StrategyCollector CollectorFunc
	GraphCollector    CollectorFunc
	MemoryCollector   CollectorFunc
}

// EnrichmentInput is the per-turn data needed by all collectors.
type EnrichmentInput struct {
	SessionID     string
	UserText      string
	CWD           string
	EditorContext *EditorContext
	TurnNumber    int
}

// EnrichmentOutput is the assembled result of a single enrichment pass.
type EnrichmentOutput struct {
	// XMLBlock is the full <phantom-context> XML wrapping all successful
	// source fragments, ready for prompt injection.
	XMLBlock string

	// Chips reports what happened per source (success / error / skipped).
	Chips []ChipEvent

	// EnrichedText is XMLBlock + "\n\n" + UserText (or just UserText when
	// XMLBlock is empty).
	EnrichedText string
}

// collectorResult is the internal return value from a single collector.
type collectorResult struct {
	Source string
	XML    string
	Tokens int
	Err    error
}

// collectorOutcome pairs a collector's output with whether it completed.
type collectorOutcome struct {
	result collectorResult
	done   bool
}

// sourcePriority defines the order in which sources are included when
// assembling the XML block under the token budget.
var sourcePriority = []string{"editor", "strategy", "graph", "memory"}

// Enrich runs all configured collectors in parallel, enforces the timeout,
// and assembles the output.
func (p *EnrichmentPipeline) Enrich(ctx context.Context, input EnrichmentInput) EnrichmentOutput {
	timeout := p.Timeout
	if timeout == 0 {
		timeout = 500 * time.Millisecond
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	collectors := map[string]CollectorFunc{
		"strategy": p.StrategyCollector,
		"graph":    p.GraphCollector,
		"memory":   p.MemoryCollector,
	}

	var mu sync.Mutex
	results := make(map[string]collectorOutcome)

	var wg sync.WaitGroup

	// Editor is always collected synchronously (fast, no I/O).
	editorResult := collectEditor(input.EditorContext)
	results["editor"] = collectorOutcome{result: editorResult, done: true}

	// Launch optional collectors.
	for name, fn := range collectors {
		if fn == nil {
			results[name] = collectorOutcome{
				result: collectorResult{Source: name},
				done:   false, // nil → skipped
			}
			continue
		}
		wg.Add(1)
		go func(name string, fn CollectorFunc) {
			defer wg.Done()

			// Channel to detect completion vs timeout.
			ch := make(chan collectorResult, 1)
			go func() {
				ch <- fn(ctx, input)
			}()

			select {
			case r := <-ch:
				mu.Lock()
				results[name] = collectorOutcome{result: r, done: true}
				mu.Unlock()
			case <-ctx.Done():
				mu.Lock()
				results[name] = collectorOutcome{
					result: collectorResult{
						Source: name,
						Err:   fmt.Errorf("timeout after %s", timeout),
					},
					done: true,
				}
				mu.Unlock()
			}
		}(name, fn)
	}

	wg.Wait()

	return assembleOutput(results, input)
}

// collectEditor builds an XML fragment from the active editor state.
func collectEditor(ec *EditorContext) collectorResult {
	if ec == nil || ec.FilePath == "" {
		return collectorResult{Source: "editor"}
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf(`<editor file=%q`, ec.FilePath))
	if ec.Cursor != "" {
		b.WriteString(fmt.Sprintf(` line=%q`, ec.Cursor))
	}
	if ec.Language != "" {
		b.WriteString(fmt.Sprintf(` lang=%q`, ec.Language))
	}
	if ec.Selection != "" {
		b.WriteString(fmt.Sprintf(` selection=%q`, ec.Selection))
	}
	b.WriteString(" />")

	xml := b.String()
	tokens := estimateTokens(xml)

	return collectorResult{
		Source: "editor",
		XML:    xml,
		Tokens: tokens,
	}
}

// assembleOutput collects results from all sources, builds the XML block
// respecting the token budget, and generates chip events.
func assembleOutput(results map[string]collectorOutcome, input EnrichmentInput) EnrichmentOutput {
	var chips []ChipEvent
	var xmlParts []string
	totalTokens := 0

	// Include sources in priority order, respecting token budget.
	for _, source := range sourcePriority {
		ir, ok := results[source]
		if !ok {
			continue
		}

		chip := buildChip(source, ir)
		chips = append(chips, chip)

		if ir.result.XML != "" && ir.result.Err == nil && ir.done {
			if totalTokens+ir.result.Tokens <= maxTokenBudget {
				xmlParts = append(xmlParts, ir.result.XML)
				totalTokens += ir.result.Tokens
			}
		}
	}

	var xmlBlock string
	if len(xmlParts) > 0 {
		xmlBlock = fmt.Sprintf(
			"<phantom-context turn=%q tokens=\"~%d\">\n%s\n</phantom-context>",
			fmt.Sprintf("%d", input.TurnNumber),
			totalTokens,
			strings.Join(xmlParts, "\n"),
		)
	}

	enrichedText := input.UserText
	if xmlBlock != "" {
		enrichedText = xmlBlock + "\n\n" + input.UserText
	}

	return EnrichmentOutput{
		XMLBlock:     xmlBlock,
		Chips:        chips,
		EnrichedText: enrichedText,
	}
}

// buildChip generates a ChipEvent for a single source based on its result.
func buildChip(source string, ir collectorOutcome) ChipEvent {
	chip := ChipEvent{
		Category: "context",
		Source:   source,
		Tokens:   ir.result.Tokens,
	}

	switch {
	case !ir.done:
		// Nil collector → skipped.
		chip.Status = "neutral"
		chip.Label = capitalizeFirst(source) + ": skipped"
	case ir.result.Err != nil:
		chip.Status = "error"
		chip.Label = capitalizeFirst(source) + ": " + ir.result.Err.Error()
	case ir.result.XML == "":
		// Collector ran but produced nothing (e.g. nil EditorContext).
		chip.Status = "neutral"
		chip.Label = capitalizeFirst(source) + ": no data"
	default:
		chip.Status = "success"
		chip.Label = buildChipLabel(source, ir.result)
	}

	return chip
}

// buildChipLabel generates a human-readable label for a successful source.
func buildChipLabel(source string, r collectorResult) string {
	switch source {
	case "editor":
		// Parse file and line from the XML for a friendlier label.
		// XML is like: <editor file="session.go" line="142" ... />
		file := extractAttr(r.XML, "file")
		line := extractAttr(r.XML, "line")
		if file != "" {
			base := filepath.Base(file)
			if line != "" {
				return fmt.Sprintf("Editor: %s:%s", base, line)
			}
			return fmt.Sprintf("Editor: %s", base)
		}
		return "Editor: active"
	case "strategy":
		return fmt.Sprintf("Strategy: %d tokens", r.Tokens)
	case "graph":
		return fmt.Sprintf("Graph: %d tokens", r.Tokens)
	case "memory":
		return fmt.Sprintf("Memory: %d tokens", r.Tokens)
	default:
		return fmt.Sprintf("%s: %d tokens", capitalizeFirst(source), r.Tokens)
	}
}

// extractAttr is a minimal helper that pulls the value of a named XML
// attribute from a single-element string. Not a general XML parser —
// only used for our own well-formed fragments.
func extractAttr(xml, attr string) string {
	key := attr + `="`
	idx := strings.Index(xml, key)
	if idx < 0 {
		return ""
	}
	start := idx + len(key)
	end := strings.Index(xml[start:], `"`)
	if end < 0 {
		return ""
	}
	return xml[start : start+end]
}

// estimateTokens gives a rough token count for an XML string.
// ~4 chars per token is a reasonable approximation for English + XML.
func estimateTokens(s string) int {
	n := len(s) / 4
	if n == 0 && len(s) > 0 {
		n = 1
	}
	return n
}

// capitalizeFirst uppercases the first rune of s. Avoids deprecated
// strings.Title and the golang.org/x/text dependency.
func capitalizeFirst(s string) string {
	if s == "" {
		return s
	}
	runes := []rune(s)
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}
