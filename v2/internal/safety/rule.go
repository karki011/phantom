// rule.go defines the Rule type and matching logic for the Phantom Safety Rules Engine.
// Author: Subash Karki
package safety

import (
	"regexp"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// Level defines the action taken when a rule matches.
type Level string

const (
	LevelBlock   Level = "block"
	LevelConfirm Level = "confirm"
	LevelWarn    Level = "warn"
	LevelLog     Level = "log"
)

// Rule is a single safety rule loaded from a YAML ward file.
type Rule struct {
	ID          string   `yaml:"id" json:"id"`
	Name        string   `yaml:"name" json:"name"`
	Level       Level    `yaml:"level" json:"level"`
	Description string   `yaml:"description,omitempty" json:"description"`
	Tool        string   `yaml:"tool,omitempty" json:"tool"`
	Pattern     string   `yaml:"pattern,omitempty" json:"pattern"`
	PathPattern string   `yaml:"path_pattern,omitempty" json:"path_pattern"`
	Message     string   `yaml:"message,omitempty" json:"message"`
	AllowBypass bool     `yaml:"allow_bypass" json:"allow_bypass"`
	Enabled     bool     `yaml:"enabled" json:"enabled"`
	Audit       bool     `yaml:"audit" json:"audit"`
	Tags       []string `yaml:"tags,omitempty" json:"tags"`
	EventType  string   `yaml:"event_type,omitempty" json:"event_type,omitempty"`
	SessionIDs []string `yaml:"session_ids,omitempty" json:"session_ids,omitempty"`

	compiledPat  *regexp.Regexp
	compiledPath *regexp.Regexp
}

// Compile pre-compiles Pattern and PathPattern regexes.
// Must be called after loading rules from YAML before calling Match.
func (r *Rule) Compile() error {
	if r.Pattern != "" {
		re, err := regexp.Compile(r.Pattern)
		if err != nil {
			return err
		}
		r.compiledPat = re
	}
	if r.PathPattern != "" {
		re, err := regexp.Compile(r.PathPattern)
		if err != nil {
			return err
		}
		r.compiledPath = re
	}
	return nil
}

// Match checks if the given event triggers this rule.
// All set conditions (Tool, Pattern, PathPattern) must match (AND logic).
// A disabled rule never matches.
func (r *Rule) Match(ev *stream.Event) bool {
	if !r.Enabled {
		return false
	}

	// EventType filter: if set, the event must match. Empty means match all.
	if r.EventType != "" && r.EventType != string(ev.Type) {
		return false
	}

	// Session scope: if SessionIDs is set, the event's session must be in the list.
	if len(r.SessionIDs) > 0 {
		found := false
		for _, sid := range r.SessionIDs {
			if sid == ev.SessionID {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Tool filter: case-insensitive comparison.
	if r.Tool != "" {
		if !strings.EqualFold(ev.ToolName, r.Tool) {
			return false
		}
	}

	// Pattern filter: match against ToolInput or Content.
	if r.compiledPat != nil {
		target := ev.ToolInput
		if target == "" {
			target = ev.Content
		}
		if !r.compiledPat.MatchString(target) {
			return false
		}
	}

	// PathPattern filter: match against FilePath.
	if r.compiledPath != nil {
		if !r.compiledPath.MatchString(ev.FilePath) {
			return false
		}
	}

	return true
}
