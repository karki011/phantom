// Package codex — tests for the CodexProvider adapter.
//
// Author: Subash Karki
// Date: 2026-04-26
package codex

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// testConfig returns a minimal ProviderConfig suitable for testing the Codex adapter.
func testConfig() *provider.ProviderConfig {
	return &provider.ProviderConfig{
		Provider:     "codex",
		DisplayName_: "OpenAI Codex CLI",
		Icon_:        "openai",
		Enabled_:     true,
		Detection:    provider.DetectionConfig{Binary: "codex"},
		Paths: provider.PathsConfig{
			Sessions:      "~/.codex/",
			Conversations: "~/.codex/sessions/",
			Settings:      "~/.codex/state_5.sqlite",
		},
		Sessions: provider.SessionsConfig{
			DiscoveryMethod: "sqlite",
			SQLite: &provider.SQLiteConfig{
				Path:  "~/.codex/state_5.sqlite",
				Table: "threads",
				Fields: map[string]string{
					"id":         "id",
					"cwd":        "cwd",
					"model":      "model",
					"title":      "title",
					"tokens_used": "tokens_used",
					"source":     "source",
					"git_sha":    "git_sha",
					"git_branch": "git_branch",
				},
			},
			JSONLIndex: &provider.JSONLIndexConfig{
				Path: "~/.codex/session_index.jsonl",
				Fields: map[string]string{
					"id":         "id",
					"name":       "thread_name",
					"updated_at": "updated_at",
				},
			},
			AliveCheck: "none",
		},
		Conversations: provider.ConversationsConfig{
			Encoding:          "jsonl",
			FileExtension:     ".jsonl",
			PathConvention:    "date-nested",
			ContentExtraction: "openai-events",
			TokenStrategy:     "aggregate",
			MessageTypes: map[string]provider.MessageTypeConfig{
				"user":         {Match: []provider.MatchRule{{Field: "type", Value: "event_msg"}}},
				"assistant":    {Match: []provider.MatchRule{{Field: "type", Value: "response_item"}}},
				"system":       {Match: []provider.MatchRule{{Field: "type", Value: "turn_context"}}},
				"session_meta": {Match: []provider.MatchRule{{Field: "type", Value: "session_meta"}}},
			},
			Usage: provider.UsageConfig{
				Locations: []string{"usage", "response.usage"},
				Fields: map[string]string{
					"input":  "prompt_tokens",
					"output": "completion_tokens",
					"total":  "total_tokens",
				},
			},
		},
		Pricing: provider.PricingConfig{
			DefaultTier: "codex",
			Tiers: map[string]provider.PriceTier{
				"codex": {Match: "codex", InputPerM: 2.50, OutputPerM: 10.0, CacheReadPerM: 0.0, CacheWritePerM: 0.0},
				"gpt4o": {Match: "gpt-4o", InputPerM: 2.50, OutputPerM: 10.0, CacheReadPerM: 1.25, CacheWritePerM: 0.0},
				"o3":    {Match: "o3", InputPerM: 2.0, OutputPerM: 8.0, CacheReadPerM: 0.0, CacheWritePerM: 0.0},
			},
		},
	}
}

// ---------------------------------------------------------------------------
// TestDiscoverSessions_JSONL
// ---------------------------------------------------------------------------

// sampleSessionIndex is a representative JSONL session index fixture.
const sampleSessionIndex = `{"id":"019dcd25-5864-7df2-975f-88439bb0752a","thread_name":"Fix auth loop","updated_at":"2026-04-27T04:14:31.074Z"}
{"id":"019dcd26-1234-aaaa-bbbb-ccccddddeeee","thread_name":"Add codex adapter","updated_at":"2026-04-26T10:30:00.000Z"}
{"id":"019dcd27-5678-ffff-0000-111122223333","thread_name":"Refactor provider","updated_at":"2026-04-25T08:00:00.000Z"}
`

func TestDiscoverSessions_JSONL(t *testing.T) {
	// Create a temp dir with a session_index.jsonl file
	tmpDir := t.TempDir()
	indexPath := filepath.Join(tmpDir, "session_index.jsonl")
	if err := os.WriteFile(indexPath, []byte(sampleSessionIndex), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := testConfig()
	// Point JSONL index to our temp file
	cfg.Sessions.JSONLIndex.Path = indexPath
	// Make SQLite fail by pointing to a nonexistent file
	cfg.Sessions.SQLite.Path = filepath.Join(tmpDir, "nonexistent.sqlite")

	cp := New(cfg)

	sessions, err := cp.DiscoverSessions(t.Context())
	if err != nil {
		t.Fatalf("DiscoverSessions error: %v", err)
	}

	if got := len(sessions); got != 3 {
		t.Fatalf("len(sessions) = %d, want 3", got)
	}

	// Verify first session
	s := sessions[0]
	if s.ID != "019dcd25-5864-7df2-975f-88439bb0752a" {
		t.Errorf("sessions[0].ID = %q, want %q", s.ID, "019dcd25-5864-7df2-975f-88439bb0752a")
	}
	if s.Name != "Fix auth loop" {
		t.Errorf("sessions[0].Name = %q, want %q", s.Name, "Fix auth loop")
	}
	if s.Provider != "codex" {
		t.Errorf("sessions[0].Provider = %q, want %q", s.Provider, "codex")
	}
	if s.UpdatedAt.IsZero() {
		t.Error("sessions[0].UpdatedAt should not be zero")
	}

	// Verify second session
	if sessions[1].ID != "019dcd26-1234-aaaa-bbbb-ccccddddeeee" {
		t.Errorf("sessions[1].ID = %q, want %q", sessions[1].ID, "019dcd26-1234-aaaa-bbbb-ccccddddeeee")
	}
	if sessions[1].Name != "Add codex adapter" {
		t.Errorf("sessions[1].Name = %q, want %q", sessions[1].Name, "Add codex adapter")
	}
}

// ---------------------------------------------------------------------------
// TestFindConversationFile
// ---------------------------------------------------------------------------

func TestFindConversationFile(t *testing.T) {
	// Create date-nested directory structure
	tmpDir := t.TempDir()
	sessionID := "019dcd25-5864-7df2-975f-88439bb0752a"

	dateDir := filepath.Join(tmpDir, "2026", "04", "27")
	if err := os.MkdirAll(dateDir, 0o755); err != nil {
		t.Fatal(err)
	}

	filename := "rollout-1745727271074-" + sessionID + ".jsonl"
	expectedPath := filepath.Join(dateDir, filename)
	if err := os.WriteFile(expectedPath, []byte(`{"type":"session_meta"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := testConfig()
	cfg.Paths.Conversations = tmpDir

	cp := New(cfg)

	got, err := cp.FindConversationFile(sessionID, "")
	if err != nil {
		t.Fatalf("FindConversationFile(%q, \"\") error: %v", sessionID, err)
	}
	if got != expectedPath {
		t.Errorf("FindConversationFile(%q, \"\") = %q, want %q", sessionID, got, expectedPath)
	}
}

func TestFindConversationFile_NotFound(t *testing.T) {
	tmpDir := t.TempDir()

	cfg := testConfig()
	cfg.Paths.Conversations = tmpDir

	cp := New(cfg)

	_, err := cp.FindConversationFile("nonexistent-id", "")
	if err == nil {
		t.Error("expected error for missing file, got nil")
	}
}

func TestFindConversationFile_EmptySessionID(t *testing.T) {
	cfg := testConfig()
	cp := New(cfg)

	_, err := cp.FindConversationFile("", "/some/cwd")
	if err == nil {
		t.Error("expected error for empty sessionID, got nil")
	}
}

func TestFindConversationFile_CWDIgnored(t *testing.T) {
	// Verify that CWD parameter doesn't affect lookup (date-nested, not cwd-nested)
	tmpDir := t.TempDir()
	sessionID := "abc-123-def"

	dateDir := filepath.Join(tmpDir, "2026", "01", "15")
	if err := os.MkdirAll(dateDir, 0o755); err != nil {
		t.Fatal(err)
	}

	filename := "rollout-1700000000-" + sessionID + ".jsonl"
	expectedPath := filepath.Join(dateDir, filename)
	if err := os.WriteFile(expectedPath, []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := testConfig()
	cfg.Paths.Conversations = tmpDir

	cp := New(cfg)

	got, err := cp.FindConversationFile(sessionID, "/some/random/cwd")
	if err != nil {
		t.Fatalf("FindConversationFile with CWD error: %v", err)
	}
	if got != expectedPath {
		t.Errorf("FindConversationFile with CWD = %q, want %q", got, expectedPath)
	}
}

// ---------------------------------------------------------------------------
// TestParseConversation
// ---------------------------------------------------------------------------

const sampleCodexJSONL = `{"timestamp":"2026-04-27T04:14:31.074Z","type":"session_meta","payload":{"id":"019dcd25-5864-7df2-975f-88439bb0752a","timestamp":"2026-04-27T04:14:29.989Z","cwd":"/Users/subash/project","originator":"Claude Code","cli_version":"0.117.0","source":"vscode","model_provider":"openai"}}
{"timestamp":"2026-04-27T04:14:32.000Z","type":"event_msg","payload":{"type":"user_message","content":"Fix the auth loop bug"}}
{"timestamp":"2026-04-27T04:14:33.000Z","type":"turn_context","payload":{"model":"gpt-4o","content":"System context loaded"}}
{"timestamp":"2026-04-27T04:14:35.000Z","type":"response_item","payload":{"item":{"content":"I'll investigate the auth loop issue.","model":"gpt-4o"},"usage":{"prompt_tokens":500,"completion_tokens":200,"total_tokens":700}}}
{"timestamp":"2026-04-27T04:14:40.000Z","type":"event_msg","payload":{"type":"task_started"}}
{"timestamp":"2026-04-27T04:14:50.000Z","type":"response_item","payload":{"item":{"content":"Found the root cause: stale token in localStorage.","model":"gpt-4o","tool_calls":[{"id":"call_123","name":"Read","arguments":{"file_path":"/tmp/test.ts"}}]},"usage":{"prompt_tokens":800,"completion_tokens":300,"total_tokens":1100}}}
{"timestamp":"2026-04-27T04:15:00.000Z","type":"event_msg","payload":{"type":"task_complete"}}
`

func TestParseConversation(t *testing.T) {
	cfg := testConfig()
	cp := New(cfg)

	conv, err := cp.ParseConversation(strings.NewReader(sampleCodexJSONL))
	if err != nil {
		t.Fatalf("ParseConversation error: %v", err)
	}

	if conv.Provider != "codex" {
		t.Errorf("Provider = %q, want %q", conv.Provider, "codex")
	}

	// Expected messages: session_meta, user, system (turn_context), assistant, system (task_started), assistant, system (task_complete) = 7
	if got := len(conv.Messages); got != 7 {
		t.Fatalf("len(Messages) = %d, want 7", got)
	}

	// Verify message types
	expectedTypes := []provider.MessageType{
		provider.MessageType("session_meta"),
		provider.MessageUser,
		provider.MessageSystem,
		provider.MessageAssistant,
		provider.MessageSystem,
		provider.MessageAssistant,
		provider.MessageSystem,
	}
	for i, want := range expectedTypes {
		if i >= len(conv.Messages) {
			break
		}
		if got := conv.Messages[i].Type; got != want {
			t.Errorf("Messages[%d].Type = %q, want %q", i, got, want)
		}
	}

	// Verify session_meta extracted session ID
	if conv.SessionID != "019dcd25-5864-7df2-975f-88439bb0752a" {
		t.Errorf("SessionID = %q, want %q", conv.SessionID, "019dcd25-5864-7df2-975f-88439bb0752a")
	}

	// Verify user message content
	if got := conv.Messages[1].Content; got != "Fix the auth loop bug" {
		t.Errorf("Messages[1].Content = %q, want %q", got, "Fix the auth loop bug")
	}

	// Verify assistant message content and model
	if got := conv.Messages[3].Content; got != "I'll investigate the auth loop issue." {
		t.Errorf("Messages[3].Content = %q, want %q", got, "I'll investigate the auth loop issue.")
	}
	if got := conv.Messages[3].Model; got != "gpt-4o" {
		t.Errorf("Messages[3].Model = %q, want %q", got, "gpt-4o")
	}

	// Verify tool calls in second assistant message
	assistantMsg := conv.Messages[5]
	if len(assistantMsg.ToolCalls) == 0 {
		t.Error("expected tool calls in second assistant message")
	} else {
		if assistantMsg.ToolCalls[0].Name != "Read" {
			t.Errorf("tool name = %q, want %q", assistantMsg.ToolCalls[0].Name, "Read")
		}
		if assistantMsg.ToolCalls[0].ID != "call_123" {
			t.Errorf("tool ID = %q, want %q", assistantMsg.ToolCalls[0].ID, "call_123")
		}
	}

	// Verify total usage accumulation
	// First response: 500 prompt + 200 completion + 700 total
	// Second response: 800 prompt + 300 completion + 1100 total
	if conv.TotalUsage == nil {
		t.Fatal("TotalUsage is nil")
	}
	if got, want := conv.TotalUsage.Input, int64(1300); got != want {
		t.Errorf("TotalUsage.Input = %d, want %d", got, want)
	}
	if got, want := conv.TotalUsage.Output, int64(500); got != want {
		t.Errorf("TotalUsage.Output = %d, want %d", got, want)
	}
	if got, want := conv.TotalUsage.Total, int64(1800); got != want {
		t.Errorf("TotalUsage.Total = %d, want %d", got, want)
	}

	// Verify timestamps
	if conv.StartTime.IsZero() {
		t.Error("StartTime should not be zero")
	}
	if conv.EndTime.IsZero() {
		t.Error("EndTime should not be zero")
	}
}

func TestParseConversation_EmptyInput(t *testing.T) {
	cfg := testConfig()
	cp := New(cfg)

	conv, err := cp.ParseConversation(strings.NewReader(""))
	if err != nil {
		t.Fatalf("ParseConversation on empty input error: %v", err)
	}
	if len(conv.Messages) != 0 {
		t.Errorf("expected 0 messages for empty input, got %d", len(conv.Messages))
	}
}

// ---------------------------------------------------------------------------
// TestParseUsage_OpenAI
// ---------------------------------------------------------------------------

func TestParseUsage_OpenAI(t *testing.T) {
	cfg := testConfig()
	cp := New(cfg)

	tests := []struct {
		name      string
		raw       map[string]any
		wantInput int64
		wantOut   int64
		wantTotal int64
		wantNil   bool
	}{
		{
			name:      "standard OpenAI usage",
			raw:       map[string]any{"prompt_tokens": float64(500), "completion_tokens": float64(200), "total_tokens": float64(700)},
			wantInput: 500,
			wantOut:   200,
			wantTotal: 700,
		},
		{
			name:      "only prompt and completion",
			raw:       map[string]any{"prompt_tokens": float64(100), "completion_tokens": float64(50)},
			wantInput: 100,
			wantOut:   50,
			wantTotal: 0,
		},
		{
			name:    "empty map",
			raw:     map[string]any{},
			wantNil: true,
		},
		{
			name:    "nil map",
			raw:     nil,
			wantNil: true,
		},
		{
			name:      "integer values (not float64)",
			raw:       map[string]any{"prompt_tokens": 1000, "completion_tokens": 500, "total_tokens": 1500},
			wantInput: 1000,
			wantOut:   500,
			wantTotal: 1500,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			usage := cp.ParseUsage(tt.raw)
			if tt.wantNil {
				if usage != nil {
					t.Errorf("expected nil, got %+v", usage)
				}
				return
			}
			if usage == nil {
				t.Fatal("expected non-nil usage")
			}
			if usage.Input != tt.wantInput {
				t.Errorf("Input = %d, want %d", usage.Input, tt.wantInput)
			}
			if usage.Output != tt.wantOut {
				t.Errorf("Output = %d, want %d", usage.Output, tt.wantOut)
			}
			if usage.Total != tt.wantTotal {
				t.Errorf("Total = %d, want %d", usage.Total, tt.wantTotal)
			}
			// Codex has no cache fields
			if usage.CacheRead != 0 {
				t.Errorf("CacheRead = %d, want 0", usage.CacheRead)
			}
			if usage.CacheWrite != 0 {
				t.Errorf("CacheWrite = %d, want 0", usage.CacheWrite)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestCostCalculation
// ---------------------------------------------------------------------------

func TestCostCalculation(t *testing.T) {
	cfg := testConfig()
	cp := New(cfg)

	tests := []struct {
		name  string
		model string
		usage provider.TokenUsage
		want  int64
	}{
		{
			name:  "codex model",
			model: "codex-mini-latest",
			usage: provider.TokenUsage{Input: 1000, Output: 500},
			// 1000 * 2.50 + 500 * 10.0 = 2500 + 5000 = 7500
			want: 7500,
		},
		{
			name:  "gpt-4o model",
			model: "gpt-4o-2026-04-01",
			usage: provider.TokenUsage{Input: 1000, Output: 500},
			// 1000 * 2.50 + 500 * 10.0 = 2500 + 5000 = 7500
			want: 7500,
		},
		{
			name:  "gpt-4o with cache",
			model: "gpt-4o",
			usage: provider.TokenUsage{Input: 1000, Output: 500, CacheRead: 200},
			// 1000 * 2.50 + 500 * 10.0 + 200 * 1.25 = 2500 + 5000 + 250 = 7750
			want: 7750,
		},
		{
			name:  "o3 model",
			model: "o3-2026-04-16",
			usage: provider.TokenUsage{Input: 1000, Output: 500},
			// 1000 * 2.0 + 500 * 8.0 = 2000 + 4000 = 6000
			want: 6000,
		},
		{
			name:  "unknown model falls back to codex default",
			model: "some-unknown-model",
			usage: provider.TokenUsage{Input: 1000, Output: 500},
			// Falls back to "codex" tier: 1000 * 2.50 + 500 * 10.0 = 7500
			want: 7500,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := cp.CalculateCost(tt.model, tt.usage)
			if got != tt.want {
				t.Errorf("CalculateCost(%q, ...) = %d, want %d", tt.model, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestParseFlexibleTime
// ---------------------------------------------------------------------------

func TestParseFlexibleTime(t *testing.T) {
	tests := []struct {
		input string
		valid bool
	}{
		{"2026-04-27T04:14:31.074Z", true},
		{"2026-04-27T04:14:31Z", true},
		{"2026-04-27 04:14:31", true},
		{"2026-04-27", true},
		{"not-a-date", false},
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			_, err := parseFlexibleTime(tt.input)
			if tt.valid && err != nil {
				t.Errorf("parseFlexibleTime(%q) unexpected error: %v", tt.input, err)
			}
			if !tt.valid && err == nil {
				t.Errorf("parseFlexibleTime(%q) expected error, got nil", tt.input)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestExtractTextContent
// ---------------------------------------------------------------------------

func TestExtractTextContent(t *testing.T) {
	tests := []struct {
		name  string
		input any
		want  string
	}{
		{"plain string", "hello world", "hello world"},
		{"text array", []any{map[string]any{"text": "part1"}, map[string]any{"text": "part2"}}, "part1\npart2"},
		{"map with text", map[string]any{"text": "from map"}, "from map"},
		{"string array", []any{"one", "two"}, "one\ntwo"},
		{"nil", nil, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractTextContent(tt.input)
			if got != tt.want {
				t.Errorf("extractTextContent() = %q, want %q", got, tt.want)
			}
		})
	}
}
