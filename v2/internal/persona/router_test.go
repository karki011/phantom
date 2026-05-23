// Author: Subash Karki
package persona

import "testing"

func TestRouter_ClaudeStatusQuery(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("what is claude doing")
	if intent.Handler != "status" || intent.Method != "claudeStatus" {
		t.Fatalf("expected status.claudeStatus, got %s.%s", intent.Handler, intent.Method)
	}
	if intent.Lane != LaneStateLookup {
		t.Fatalf("expected state_lookup lane, got %s", intent.Lane)
	}
}

func TestRouter_GitStatusQuery(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("git status")
	if intent.Handler != "git" || intent.Method != "query" {
		t.Fatalf("expected git.query, got %s.%s", intent.Handler, intent.Method)
	}
	if intent.Args["type"] != "status" {
		t.Fatalf("expected type=status, got %q", intent.Args["type"])
	}
}

func TestRouter_GitLogQuery(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("show me git log")
	if intent.Handler != "git" || intent.Args["type"] != "log" {
		t.Fatalf("expected git.query type=log, got %s.%s type=%s", intent.Handler, intent.Method, intent.Args["type"])
	}
}

func TestRouter_OpenTerminal(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("open a terminal")
	if intent.Handler != "terminal" || intent.Method != "open" {
		t.Fatalf("expected terminal.open, got %s.%s", intent.Handler, intent.Method)
	}
	if intent.Lane != LaneSystemAction {
		t.Fatalf("expected system_action lane, got %s", intent.Lane)
	}
}

func TestRouter_WhatChanged(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("what changed")
	if intent.Handler != "git" || intent.Method != "recentChanges" {
		t.Fatalf("expected git.recentChanges, got %s.%s", intent.Handler, intent.Method)
	}
}

func TestRouter_WhyDidBuildFail(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("why did the build fail")
	if intent.Lane != LaneLocalReasoning {
		t.Fatalf("expected local_reasoning lane, got %s", intent.Lane)
	}
}

func TestRouter_SearchQuery(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("search for authentication")
	if intent.Handler != "search" || intent.Args["query"] != "authentication" {
		t.Fatalf("expected search handler with query=authentication, got %s query=%q", intent.Handler, intent.Args["query"])
	}
}

func TestRouter_UnknownFallsToReasoning(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("explain the trade-offs of microservices vs monolith")
	if intent.Lane != LaneLocalReasoning {
		t.Fatalf("expected local_reasoning for unknown input, got %s", intent.Lane)
	}
}

func TestRouter_CaseInsensitive(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("What Is Claude Doing?")
	if intent.Handler != "status" {
		t.Fatalf("expected status handler for mixed case, got %s", intent.Handler)
	}
}

func TestRouter_HowManyTerminals(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("how many terminals are open")
	if intent.Handler != "status" || intent.Method != "terminalCount" {
		t.Fatalf("expected status.terminalCount, got %s.%s", intent.Handler, intent.Method)
	}
}
