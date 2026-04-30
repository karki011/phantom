// Package claude — tests for the ClaudeProvider adapter.
//
// Author: Subash Karki
// Date: 2026-04-26
package claude

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// testConfig returns a minimal ProviderConfig suitable for testing.
func testConfig() *provider.ProviderConfig {
	return &provider.ProviderConfig{
		Provider:      "claude",
		DisplayName_:  "Claude Code",
		Icon_:         "anthropic",
		Enabled_:      true,
		Detection:     provider.DetectionConfig{Binary: "claude"},
		Paths: provider.PathsConfig{
			Sessions:      "~/.claude/sessions/",
			Conversations: "~/.claude/projects/",
			Settings:      "~/.claude/settings.json",
			Todos:         "~/.claude/todos/",
			Tasks:         "~/.claude/tasks/",
			Context:       "~/.phantom-os/context/claude/",
		},
		Sessions: provider.SessionsConfig{
			DiscoveryMethod: "glob",
			Glob:            "*.json",
			AliveCheck:      "pid",
		},
		Conversations: provider.ConversationsConfig{
			Encoding:          "jsonl",
			FileExtension:     ".jsonl",
			PathConvention:    "encoded",
			ContentExtraction: "claude-blocks",
			TokenStrategy:     "inline",
			MessageTypes: map[string]provider.MessageTypeConfig{
				"user":        {Match: []provider.MatchRule{{Field: "type", Value: "human"}}},
				"assistant":   {Match: []provider.MatchRule{{Field: "type", Value: "assistant"}}},
				"tool_use":    {Match: []provider.MatchRule{{Field: "type", Value: "tool_use"}}},
				"tool_result": {Match: []provider.MatchRule{{Field: "type", Value: "tool_result"}}},
				"system":      {Match: []provider.MatchRule{{Field: "type", Value: "system"}}},
			},
			Usage: provider.UsageConfig{
				Locations: []string{"usage", "message.usage", "result.usage"},
				Fields: map[string]string{
					"input":       "input_tokens",
					"output":      "output_tokens",
					"cache_read":  "cache_read_input_tokens",
					"cache_write": "cache_creation_input_tokens",
				},
			},
		},
		Pricing: provider.PricingConfig{
			DefaultTier: "sonnet",
			Tiers: map[string]provider.PriceTier{
				"sonnet": {Match: "sonnet", InputPerM: 3.0, OutputPerM: 15.0, CacheReadPerM: 0.30, CacheWritePerM: 3.75},
				"opus":   {Match: "opus", InputPerM: 15.0, OutputPerM: 75.0, CacheReadPerM: 1.50, CacheWritePerM: 18.75},
				"haiku":  {Match: "haiku", InputPerM: 0.80, OutputPerM: 4.0, CacheReadPerM: 0.08, CacheWritePerM: 1.0},
			},
		},
	}
}

// TestFindConversationFile_WithCWD verifies the encoded-path convention:
// CWD /Users/subash/project becomes Users-subash-project in the projects dir.
func TestFindConversationFile_WithCWD(t *testing.T) {
	// Create a temp dir to simulate ~/.claude/projects/
	tmpDir := t.TempDir()

	cfg := testConfig()
	cfg.Paths.Conversations = tmpDir

	cp := New(cfg)

	// Simulate a session file at the encoded path
	cwd := "/Users/subash/my-project"
	sessionID := "abc-123-def"

	// Encoded: /Users/subash/my-project -> -Users-subash-my-project -> Users-subash-my-project
	encodedPath := strings.ReplaceAll(cwd, "/", "-")
	if strings.HasPrefix(encodedPath, "-") {
		encodedPath = encodedPath[1:]
	}

	projectDir := filepath.Join(tmpDir, encodedPath)
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		t.Fatal(err)
	}

	expectedFile := filepath.Join(projectDir, sessionID+".jsonl")
	if err := os.WriteFile(expectedFile, []byte(`{"type":"human"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	// Test: find with CWD
	got, err := cp.FindConversationFile(sessionID, cwd)
	if err != nil {
		t.Fatalf("FindConversationFile(%q, %q) error: %v", sessionID, cwd, err)
	}
	if got != expectedFile {
		t.Errorf("FindConversationFile(%q, %q) = %q, want %q", sessionID, cwd, got, expectedFile)
	}
}

// TestFindConversationFile_NoCWD verifies walk-based discovery when CWD is empty.
func TestFindConversationFile_NoCWD(t *testing.T) {
	tmpDir := t.TempDir()

	cfg := testConfig()
	cfg.Paths.Conversations = tmpDir

	cp := New(cfg)

	sessionID := "walk-session-456"

	// Create the file in a nested directory
	nestedDir := filepath.Join(tmpDir, "Users-subash-some-project")
	if err := os.MkdirAll(nestedDir, 0o755); err != nil {
		t.Fatal(err)
	}

	expectedFile := filepath.Join(nestedDir, sessionID+".jsonl")
	if err := os.WriteFile(expectedFile, []byte(`{"type":"human"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	// Test: find without CWD (walk)
	got, err := cp.FindConversationFile(sessionID, "")
	if err != nil {
		t.Fatalf("FindConversationFile(%q, \"\") error: %v", sessionID, err)
	}
	if got != expectedFile {
		t.Errorf("FindConversationFile(%q, \"\") = %q, want %q", sessionID, got, expectedFile)
	}
}

// TestFindConversationFile_NotFound verifies error when file doesn't exist.
func TestFindConversationFile_NotFound(t *testing.T) {
	tmpDir := t.TempDir()

	cfg := testConfig()
	cfg.Paths.Conversations = tmpDir

	cp := New(cfg)

	_, err := cp.FindConversationFile("nonexistent", "/some/cwd")
	if err == nil {
		t.Error("expected error for missing file, got nil")
	}
}

// TestFindConversationFile_EmptySessionID verifies error for empty session ID.
func TestFindConversationFile_EmptySessionID(t *testing.T) {
	cfg := testConfig()
	cp := New(cfg)

	_, err := cp.FindConversationFile("", "/some/cwd")
	if err == nil {
		t.Error("expected error for empty sessionID, got nil")
	}
}

// sampleClaudeJSONL is a representative JSONL fixture with Claude conversation data.
const sampleClaudeJSONL = `{"type":"system","content":"You are a helpful assistant."}
{"type":"human","content":"Hello, what is 2+2?"}
{"type":"assistant","message":{"role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"thinking","text":"The user is asking a simple math question."},{"type":"text","text":"2+2 equals 4."}],"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":20,"cache_creation_input_tokens":10}}}
{"type":"assistant","message":{"role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"Is there anything else?"},{"type":"tool_use","name":"Read","input":{"file_path":"/tmp/test.txt"}}],"usage":{"input_tokens":200,"output_tokens":75,"cache_read_input_tokens":30,"cache_creation_input_tokens":5}}}
{"type":"tool_result","content":"file contents here"}
{"type":"human","content":"No thanks, bye!"}
{"type":"assistant","usage":{"input_tokens":50,"output_tokens":25,"cache_read_input_tokens":0,"cache_creation_input_tokens":0},"content":[{"type":"text","text":"Goodbye!"}]}
`

// TestParseConversation verifies correct parsing of Claude JSONL format.
func TestParseConversation(t *testing.T) {
	cfg := testConfig()
	cp := New(cfg)

	r := strings.NewReader(sampleClaudeJSONL)
	conv, err := cp.ParseConversation(r)
	if err != nil {
		t.Fatalf("ParseConversation error: %v", err)
	}

	if conv.Provider != "claude" {
		t.Errorf("Provider = %q, want %q", conv.Provider, "claude")
	}

	// Expected messages: system, human, assistant, assistant, tool_result, human, assistant = 7
	if got := len(conv.Messages); got != 7 {
		t.Errorf("len(Messages) = %d, want 7", got)
	}

	// Verify message types
	expectedTypes := []provider.MessageType{
		provider.MessageSystem,
		provider.MessageUser,
		provider.MessageAssistant,
		provider.MessageAssistant,
		provider.MessageToolResult,
		provider.MessageUser,
		provider.MessageAssistant,
	}
	for i, want := range expectedTypes {
		if i >= len(conv.Messages) {
			break
		}
		if got := conv.Messages[i].Type; got != want {
			t.Errorf("Messages[%d].Type = %q, want %q", i, got, want)
		}
	}

	// Verify thinking block was extracted from first assistant message
	if len(conv.Messages) > 2 {
		assistantMsg := conv.Messages[2]
		if len(assistantMsg.Thoughts) == 0 {
			t.Error("expected thinking block in first assistant message")
		} else if assistantMsg.Thoughts[0].Description != "The user is asking a simple math question." {
			t.Errorf("thinking text = %q, want %q", assistantMsg.Thoughts[0].Description, "The user is asking a simple math question.")
		}
	}

	// Verify tool_use was extracted from second assistant message
	if len(conv.Messages) > 3 {
		assistantMsg := conv.Messages[3]
		if len(assistantMsg.ToolCalls) == 0 {
			t.Error("expected tool_use in second assistant message")
		} else if assistantMsg.ToolCalls[0].Name != "Read" {
			t.Errorf("tool name = %q, want %q", assistantMsg.ToolCalls[0].Name, "Read")
		}
	}

	// Verify total usage accumulation
	// Line 3: 100+200+50 input, 50+75+25 output, 20+30+0 cache_read, 10+5+0 cache_write
	if conv.TotalUsage == nil {
		t.Fatal("TotalUsage is nil")
	}
	if got, want := conv.TotalUsage.Input, int64(350); got != want {
		t.Errorf("TotalUsage.Input = %d, want %d", got, want)
	}
	if got, want := conv.TotalUsage.Output, int64(150); got != want {
		t.Errorf("TotalUsage.Output = %d, want %d", got, want)
	}
	if got, want := conv.TotalUsage.CacheRead, int64(50); got != want {
		t.Errorf("TotalUsage.CacheRead = %d, want %d", got, want)
	}
	if got, want := conv.TotalUsage.CacheWrite, int64(15); got != want {
		t.Errorf("TotalUsage.CacheWrite = %d, want %d", got, want)
	}

	// Verify model extraction
	if len(conv.Messages) > 2 {
		if got := conv.Messages[2].Model; got != "claude-sonnet-4-20250514" {
			t.Errorf("Messages[2].Model = %q, want %q", got, "claude-sonnet-4-20250514")
		}
	}
}

// TestParseConversation_EmptyInput verifies handling of empty reader.
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

// TestParseConversation_ResultUsage verifies extraction from "result.usage" location.
func TestParseConversation_ResultUsage(t *testing.T) {
	cfg := testConfig()
	cp := New(cfg)

	jsonl := `{"type":"assistant","result":{"usage":{"input_tokens":500,"output_tokens":250,"cache_read_input_tokens":100,"cache_creation_input_tokens":50}},"content":[{"type":"text","text":"final answer"}]}
`

	conv, err := cp.ParseConversation(strings.NewReader(jsonl))
	if err != nil {
		t.Fatalf("ParseConversation error: %v", err)
	}

	if conv.TotalUsage == nil {
		t.Fatal("TotalUsage is nil")
	}
	if got, want := conv.TotalUsage.Input, int64(500); got != want {
		t.Errorf("TotalUsage.Input = %d, want %d", got, want)
	}
	if got, want := conv.TotalUsage.Output, int64(250); got != want {
		t.Errorf("TotalUsage.Output = %d, want %d", got, want)
	}
}

// TestCostCalculation verifies that the provider's cost calculation matches
// the existing pricing.go output for all Claude model tiers.
func TestCostCalculation(t *testing.T) {
	cfg := testConfig()
	cp := New(cfg)

	tests := []struct {
		name   string
		model  string
		usage  provider.TokenUsage
		want   int64
	}{
		{
			name:  "sonnet basic",
			model: "claude-sonnet-4-20250514",
			usage: provider.TokenUsage{Input: 1000, Output: 500},
			want:  int64(float64(1000)*3.0 + float64(500)*15.0), // 3000 + 7500 = 10500
		},
		{
			name:  "opus basic",
			model: "claude-opus-4-20250514",
			usage: provider.TokenUsage{Input: 1000, Output: 500},
			want:  int64(float64(1000)*15.0 + float64(500)*75.0), // 15000 + 37500 = 52500
		},
		{
			name:  "haiku basic",
			model: "claude-haiku-3.5-20250101",
			usage: provider.TokenUsage{Input: 1000, Output: 500},
			want:  int64(float64(1000)*0.80 + float64(500)*4.0), // 800 + 2000 = 2800
		},
		{
			name:  "sonnet with cache",
			model: "claude-sonnet-4-20250514",
			usage: provider.TokenUsage{Input: 1000, Output: 500, CacheRead: 200, CacheWrite: 100},
			want:  int64(float64(1000)*3.0 + float64(500)*15.0 + float64(200)*0.30 + float64(100)*3.75), // 3000 + 7500 + 60 + 375 = 10935
		},
		{
			name:  "unknown model falls back to sonnet",
			model: "some-unknown-model",
			usage: provider.TokenUsage{Input: 1000, Output: 500},
			want:  int64(float64(1000)*3.0 + float64(500)*15.0), // 10500 (sonnet default)
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

// TestEncodedPathConvention verifies the exact encoding matches activity_poller.go's
// findJSONLPath() logic: replace "/" with "-", strip leading "-".
func TestEncodedPathConvention(t *testing.T) {
	tests := []struct {
		cwd  string
		want string
	}{
		{"/Users/subash/project", "Users-subash-project"},
		{"/home/user/my-app", "home-user-my-app"},
		{"relative/path", "relative-path"},
		{"/", ""},
		{"/a", "a"},
	}

	for _, tt := range tests {
		t.Run(tt.cwd, func(t *testing.T) {
			encoded := strings.ReplaceAll(tt.cwd, "/", "-")
			if strings.HasPrefix(encoded, "-") {
				encoded = encoded[1:]
			}
			if encoded != tt.want {
				t.Errorf("encoded(%q) = %q, want %q", tt.cwd, encoded, tt.want)
			}
		})
	}
}

// TestForkConversation_WithCWD verifies that forking copies the source transcript
// to a new session ID under the same encoded-CWD project directory and that the
// content matches byte-for-byte.
func TestForkConversation_WithCWD(t *testing.T) {
	tmpDir := t.TempDir()

	cfg := testConfig()
	cfg.Paths.Conversations = tmpDir

	cp := New(cfg)

	if !cp.SupportsFork() {
		t.Fatal("ClaudeProvider.SupportsFork() = false, want true")
	}

	cwd := "/Users/subash/my-project"
	sessionID := "source-session-123"

	encodedPath := strings.ReplaceAll(cwd, "/", "-")
	if strings.HasPrefix(encodedPath, "-") {
		encodedPath = encodedPath[1:]
	}

	projectDir := filepath.Join(tmpDir, encodedPath)
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		t.Fatal(err)
	}

	srcPath := filepath.Join(projectDir, sessionID+".jsonl")
	srcContent := []byte(`{"type":"human","content":"hello"}` + "\n" +
		`{"type":"assistant","content":[{"type":"text","text":"hi"}]}` + "\n")
	if err := os.WriteFile(srcPath, srcContent, 0o644); err != nil {
		t.Fatal(err)
	}

	// Fork it.
	newID, err := cp.ForkConversation(sessionID, cwd, "")
	if err != nil {
		t.Fatalf("ForkConversation error: %v", err)
	}
	if newID == "" {
		t.Fatal("ForkConversation returned empty new session ID")
	}
	if newID == sessionID {
		t.Fatalf("ForkConversation returned same ID as source: %q", newID)
	}

	// New transcript must land in the same encoded-CWD directory.
	dstPath := filepath.Join(projectDir, newID+".jsonl")
	if _, err := os.Stat(dstPath); err != nil {
		t.Fatalf("expected new transcript at %s: %v", dstPath, err)
	}

	// Content must match byte-for-byte.
	got, err := os.ReadFile(dstPath)
	if err != nil {
		t.Fatalf("read new transcript: %v", err)
	}
	if string(got) != string(srcContent) {
		t.Errorf("forked content mismatch\n got: %q\nwant: %q", got, srcContent)
	}

	// Source must still exist (fork is non-destructive).
	if _, err := os.Stat(srcPath); err != nil {
		t.Errorf("source transcript was removed by fork: %v", err)
	}

	// No leftover temp file.
	tmpPath := filepath.Join(projectDir, newID+".tmp")
	if _, err := os.Stat(tmpPath); err == nil {
		t.Errorf("leftover temp file at %s", tmpPath)
	}
}

// TestForkConversation_MissingSource verifies fork errors out when the source
// transcript can't be located.
func TestForkConversation_MissingSource(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := testConfig()
	cfg.Paths.Conversations = tmpDir
	cp := New(cfg)

	_, err := cp.ForkConversation("does-not-exist", "/some/cwd", "")
	if err == nil {
		t.Error("expected error for missing source, got nil")
	}
}

// TestPathResolver verifies the PathResolver methods return expanded paths.
func TestPathResolver(t *testing.T) {
	cfg := testConfig()
	// Override paths with non-tilde paths for deterministic testing
	cfg.Paths.Sessions = "/tmp/test-sessions/"
	cfg.Paths.Conversations = "/tmp/test-conversations/"
	cfg.Paths.Todos = "/tmp/test-todos/"
	cfg.Paths.Tasks = "/tmp/test-tasks/"
	cfg.Paths.Context = "/tmp/test-context/"
	cfg.Paths.Settings = "/tmp/test-settings.json"

	cp := New(cfg)

	if got := cp.SessionsDir(); got != "/tmp/test-sessions" {
		t.Errorf("SessionsDir() = %q, want %q", got, "/tmp/test-sessions")
	}
	if got := cp.ConversationsDir(); got != "/tmp/test-conversations" {
		t.Errorf("ConversationsDir() = %q, want %q", got, "/tmp/test-conversations")
	}
	if got := cp.TodosDir(); got != "/tmp/test-todos" {
		t.Errorf("TodosDir() = %q, want %q", got, "/tmp/test-todos")
	}
	if got := cp.TasksDir(); got != "/tmp/test-tasks" {
		t.Errorf("TasksDir() = %q, want %q", got, "/tmp/test-tasks")
	}
	if got := cp.ContextDir(); got != "/tmp/test-context" {
		t.Errorf("ContextDir() = %q, want %q", got, "/tmp/test-context")
	}
	if got := cp.SettingsFile(); got != "/tmp/test-settings.json" {
		t.Errorf("SettingsFile() = %q, want %q", got, "/tmp/test-settings.json")
	}
}
