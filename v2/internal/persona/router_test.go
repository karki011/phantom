// Author: Subash Karki
package persona

import "testing"

func TestRouter_StartClaude(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("start claude")
	if intent.Handler != "claude" || intent.Method != "spawn" {
		t.Fatalf("expected claude.spawn, got %s.%s", intent.Handler, intent.Method)
	}
	if intent.Lane != LaneClaudeTask {
		t.Fatalf("expected claude_task lane, got %s", intent.Lane)
	}
}

func TestRouter_HelpMeWith(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("help me with auth refactor")
	if intent.Handler != "claude" || intent.Method != "spawn" {
		t.Fatalf("expected claude.spawn, got %s.%s", intent.Handler, intent.Method)
	}
	if intent.Args["task"] != "auth refactor" {
		t.Fatalf("expected task='auth refactor', got %q", intent.Args["task"])
	}
}

func TestRouter_PauseClaude(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("pause claude")
	if intent.Handler != "claude" || intent.Method != "pause" {
		t.Fatalf("expected claude.pause, got %s.%s", intent.Handler, intent.Method)
	}
}

func TestRouter_StopClaude(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("stop claude")
	if intent.Handler != "claude" || intent.Method != "stop" {
		t.Fatalf("expected claude.stop, got %s.%s", intent.Handler, intent.Method)
	}
}

func TestRouter_ResumeClaude(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("resume claude")
	if intent.Handler != "claude" || intent.Method != "resume" {
		t.Fatalf("expected claude.resume, got %s.%s", intent.Handler, intent.Method)
	}
}

func TestRouter_EverythingElseGoesToAI(t *testing.T) {
	r := NewRouter()

	queries := []string{
		"what is claude doing",
		"git status",
		"what changed",
		"how many terminals are open",
		"why did the build fail",
		"search for authentication",
		"explain this error",
		"random gibberish xyzzy",
		"open a terminal",
		"What Is Claude Doing?",
	}

	for _, q := range queries {
		intent := r.Classify(q)
		if intent.Handler != "ai" {
			t.Errorf("query %q: expected ai handler, got %s.%s", q, intent.Handler, intent.Method)
		}
	}
}

func TestRouter_FallbackIncludesQuery(t *testing.T) {
	r := NewRouter()
	intent := r.Classify("why is the sky blue")
	if intent.Args["query"] != "why is the sky blue" {
		t.Fatalf("expected raw query in args, got %q", intent.Args["query"])
	}
}
