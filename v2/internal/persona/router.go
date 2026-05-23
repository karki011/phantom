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
		// Claude session control — these are actions, not questions, so they stay as direct handlers.
		{pattern: regexp.MustCompile(`(?i)(?:start\s+claude|help\s+me\s+with)\s*(.+)?`), lane: LaneClaudeTask, handler: "claude", method: "spawn", argExtractors: map[string]int{"task": 1}},
		{pattern: regexp.MustCompile(`(?i)pause\s+claude`), lane: LaneClaudeTask, handler: "claude", method: "pause"},
		{pattern: regexp.MustCompile(`(?i)stop\s+claude`), lane: LaneClaudeTask, handler: "claude", method: "stop"},
		{pattern: regexp.MustCompile(`(?i)resume\s+claude`), lane: LaneClaudeTask, handler: "claude", method: "resume"},
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
		Handler: "ai",
		Method:  "reason",
		Args:    map[string]string{"query": trimmed},
		Raw:     trimmed,
	}
}
