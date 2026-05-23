// Author: Subash Karki
package persona

import (
	"regexp"
	"strings"
)

type rule struct {
	pattern       *regexp.Regexp
	lane          Lane
	handler       string
	method        string
	argExtractors map[string]int
}

type Router struct {
	rules []rule
}

func NewRouter() *Router {
	r := &Router{}
	r.rules = []rule{
		{pattern: regexp.MustCompile(`(?i)what\s+is\s+claude\s+doing`), lane: LaneStateLookup, handler: "status", method: "claudeStatus"},
		{pattern: regexp.MustCompile(`(?i)claude\s+status`), lane: LaneStateLookup, handler: "status", method: "claudeStatus"},
		{pattern: regexp.MustCompile(`(?i)how\s+many\s+terminal`), lane: LaneStateLookup, handler: "status", method: "terminalCount"},
		{pattern: regexp.MustCompile(`(?i)git\s+(status|log|diff|blame)`), lane: LaneStateLookup, handler: "git", method: "query", argExtractors: map[string]int{"type": 1}},
		{pattern: regexp.MustCompile(`(?i)what\s+changed`), lane: LaneStateLookup, handler: "git", method: "recentChanges"},
		{pattern: regexp.MustCompile(`(?i)show\s+(me\s+)?git\s+(status|log|diff|blame)`), lane: LaneStateLookup, handler: "git", method: "query", argExtractors: map[string]int{"type": 2}},
		{pattern: regexp.MustCompile(`(?i)open\s+(a\s+)?(terminal|tab|shell)`), lane: LaneSystemAction, handler: "terminal", method: "open"},
		{pattern: regexp.MustCompile(`(?i)^run\s+(.+)`), lane: LaneSystemAction, handler: "terminal", method: "runCommand", argExtractors: map[string]int{"command": 1}},
		{pattern: regexp.MustCompile(`(?i)(?:search|find)\s+(?:for\s+)?(.+)`), lane: LaneStateLookup, handler: "search", method: "search", argExtractors: map[string]int{"query": 1}},
		{pattern: regexp.MustCompile(`(?i)switch\s+to\s+(?:project\s+)?(.+)`), lane: LaneSystemAction, handler: "workspace", method: "switchProject", argExtractors: map[string]int{"project": 1}},
		{pattern: regexp.MustCompile(`(?i)(?:start\s+claude|help\s+me\s+with)\s*(.+)?`), lane: LaneClaudeTask, handler: "claude", method: "spawn", argExtractors: map[string]int{"task": 1}},
		{pattern: regexp.MustCompile(`(?i)why\s+did\s+.*\s*fail`), lane: LaneLocalReasoning, handler: "llm", method: "analyzeFailure"},
		{pattern: regexp.MustCompile(`(?i)(?:explain|summarize|describe)\s+.+`), lane: LaneLocalReasoning, handler: "llm", method: "reason"},
	}
	return r
}

func (r *Router) Classify(input string) Intent {
	trimmed := strings.TrimSpace(input)
	for _, rule := range r.rules {
		matches := rule.pattern.FindStringSubmatch(trimmed)
		if matches == nil {
			continue
		}
		intent := Intent{
			Lane:    rule.lane,
			Handler: rule.handler,
			Method:  rule.method,
			Args:    make(map[string]string),
			Raw:     trimmed,
		}
		for argName, groupIdx := range rule.argExtractors {
			if groupIdx < len(matches) {
				intent.Args[argName] = strings.TrimSpace(matches[groupIdx])
			}
		}
		return intent
	}
	return Intent{
		Lane:    LaneLocalReasoning,
		Handler: "llm",
		Method:  "reason",
		Args:    map[string]string{"query": trimmed},
		Raw:     trimmed,
	}
}
