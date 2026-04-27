// chat_rules_test.go tests the default chat safety rules.
// Author: Subash Karki
package safety

import (
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

func TestChatRules_AllCompile(t *testing.T) {
	rules := ChatRules()
	if len(rules) == 0 {
		t.Fatal("expected at least one chat rule")
	}
	for _, r := range rules {
		if r.ID == "" {
			t.Error("rule has empty ID")
		}
		if !r.Enabled {
			t.Errorf("rule %s should be enabled by default", r.ID)
		}
		// Compilation happens inside ChatRules(), verify patterns work.
		if r.Pattern != "" && r.compiledPat == nil {
			t.Errorf("rule %s has pattern but no compiled regex", r.ID)
		}
	}
}

func TestChatRules_DetectsAWSKey(t *testing.T) {
	rules := ChatRules()
	ev := &stream.Event{
		Type:      stream.EventUser,
		Content:   "My AWS key is AKIAIOSFODNN7EXAMPLE",
		ToolInput: "My AWS key is AKIAIOSFODNN7EXAMPLE",
	}

	matched := false
	for _, r := range rules {
		if r.Match(ev) {
			matched = true
			break
		}
	}
	if !matched {
		t.Error("expected AWS key to trigger a chat rule")
	}
}

func TestChatRules_DetectsGitHubToken(t *testing.T) {
	rules := ChatRules()
	ev := &stream.Event{
		Type:      stream.EventUser,
		Content:   "Use this token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl",
		ToolInput: "Use this token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl",
	}

	matched := false
	for _, r := range rules {
		if r.Match(ev) {
			matched = true
			break
		}
	}
	if !matched {
		t.Error("expected GitHub token to trigger a chat rule")
	}
}

func TestChatRules_DetectsCommandInjection(t *testing.T) {
	rules := ChatRules()
	ev := &stream.Event{
		Type:      stream.EventUser,
		Content:   "Run this: ; rm -rf /",
		ToolInput: "Run this: ; rm -rf /",
	}

	matched := false
	for _, r := range rules {
		if r.ID == "chat-command-injection" && r.Match(ev) {
			matched = true
			break
		}
	}
	if !matched {
		t.Error("expected command injection pattern to trigger chat rule")
	}
}

func TestChatRules_DetectsPasswordLeak(t *testing.T) {
	rules := ChatRules()
	ev := &stream.Event{
		Type:      stream.EventUser,
		Content:   "The password=SuperSecret123",
		ToolInput: "The password=SuperSecret123",
	}

	matched := false
	for _, r := range rules {
		if r.ID == "chat-password-leak" && r.Match(ev) {
			matched = true
			break
		}
	}
	if !matched {
		t.Error("expected password leak to trigger chat rule")
	}
}

func TestChatRules_NoFalsePositiveOnNormalMessage(t *testing.T) {
	rules := ChatRules()
	ev := &stream.Event{
		Type:      stream.EventUser,
		Content:   "How do I create a new React component?",
		ToolInput: "How do I create a new React component?",
	}

	for _, r := range rules {
		if r.Match(ev) {
			t.Errorf("rule %s should not match a normal message", r.ID)
		}
	}
}
