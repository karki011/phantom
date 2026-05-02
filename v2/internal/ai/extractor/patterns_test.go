// Author: Subash Karki
package extractor

import "testing"

// --- classifyError Tests ---

func TestClassifyError_Panic(t *testing.T) {
	tests := []string{
		"panic: nil pointer dereference",
		"FATAL error occurred",
		"segfault at address 0x0",
		"SIGSEGV received",
	}
	for _, tc := range tests {
		if got := classifyError(tc); got != "panic" {
			t.Errorf("classifyError(%q) = %q, want 'panic'", tc, got)
		}
	}
}

func TestClassifyError_Build(t *testing.T) {
	tests := []string{
		"compilation failed: missing import",
		"cannot find package 'foo'",
		"undefined: SomeVar",
		"syntax error: unexpected token",
		"does not implement interface",
	}
	for _, tc := range tests {
		if got := classifyError(tc); got != "build" {
			t.Errorf("classifyError(%q) = %q, want 'build'", tc, got)
		}
	}
}

func TestClassifyError_Import(t *testing.T) {
	tests := []string{
		"cannot find module github.com/foo/bar",
		"import xyz not found in packages",
		"could not resolve dependency",
	}
	for _, tc := range tests {
		if got := classifyError(tc); got != "import" {
			t.Errorf("classifyError(%q) = %q, want 'import'", tc, got)
		}
	}
}

func TestClassifyError_Test(t *testing.T) {
	tests := []string{
		"FAIL    github.com/foo/bar",
		"--- FAIL: TestSomething",
		"test runner failed with exit code 1",
		"assertion failed: expected 1 got 2",
	}
	for _, tc := range tests {
		if got := classifyError(tc); got != "test" {
			t.Errorf("classifyError(%q) = %q, want 'test'", tc, got)
		}
	}
}

func TestClassifyError_Runtime(t *testing.T) {
	tests := []string{
		"Error: connection refused",
		"error: timeout exceeded",
		"Exception: NullPointerException",
		"traceback (most recent call last):",
	}
	for _, tc := range tests {
		if got := classifyError(tc); got != "runtime" {
			t.Errorf("classifyError(%q) = %q, want 'runtime'", tc, got)
		}
	}
}

func TestClassifyError_NoMatch(t *testing.T) {
	tests := []string{
		"all tests passed",
		"build succeeded",
		"ok  github.com/foo/bar 0.5s",
		"",
	}
	for _, tc := range tests {
		if got := classifyError(tc); got != "" {
			t.Errorf("classifyError(%q) = %q, want empty", tc, got)
		}
	}
}

// --- sanitizeCommand Tests ---

func TestSanitizeCommand_Secrets(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"curl -H API_KEY=sk-abc123", "curl -H API_KEY=***"},
		{"export TOKEN=mytoken123", "export TOKEN=***"},
		{"set SECRET=topsecret", "set SECRET=***"},
		{"PASSWORD:hunter2 login", "PASSWORD:*** login"},
		{"CREDENTIAL=abc123", "CREDENTIAL=***"},
	}
	for _, tc := range tests {
		got := sanitizeCommand(tc.input)
		if got != tc.want {
			t.Errorf("sanitizeCommand(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestSanitizeCommand_HomePaths(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"/Users/subash/code/app", "~/code/app"},
		{"/home/ubuntu/project", "~/project"},
		{"cat /Users/john/file.txt", "cat ~/file.txt"},
	}
	for _, tc := range tests {
		got := sanitizeCommand(tc.input)
		if got != tc.want {
			t.Errorf("sanitizeCommand(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestSanitizeCommand_NoSecrets(t *testing.T) {
	input := "go test ./..."
	got := sanitizeCommand(input)
	if got != input {
		t.Errorf("sanitizeCommand(%q) = %q, want unchanged", input, got)
	}
}

// --- extractCommandPattern Tests ---

func TestExtractCommandPattern(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"go test ./...", "go test ./..."},
		{"git push origin main", "git push origin"},
		{"npm install --save-dev @types/node", "npm install @types/node"},
		{"ls -la /tmp", "ls /tmp"},
		{"", ""},
		{"go build -v -race ./cmd/app", "go build ./cmd/app"},
	}
	for _, tc := range tests {
		got := extractCommandPattern(tc.input)
		if got != tc.want {
			t.Errorf("extractCommandPattern(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestExtractCommandPattern_StopsAtPipe(t *testing.T) {
	got := extractCommandPattern("cat file.txt | grep foo")
	if got != "cat file.txt" {
		t.Errorf("extractCommandPattern with pipe = %q, want 'cat file.txt'", got)
	}
}

func TestExtractCommandPattern_StopsAtAnd(t *testing.T) {
	got := extractCommandPattern("go build && go test")
	if got != "go build" {
		t.Errorf("extractCommandPattern with && = %q, want 'go build'", got)
	}
}

// --- truncateMessage Tests ---

func TestTruncateMessage(t *testing.T) {
	short := "hello"
	if got := truncateMessage(short, 200); got != short {
		t.Errorf("truncateMessage(%q, 200) = %q, want unchanged", short, got)
	}

	long := ""
	for i := 0; i < 300; i++ {
		long += "a"
	}
	got := truncateMessage(long, 200)
	if len(got) != 200 {
		t.Errorf("truncateMessage length = %d, want 200", len(got))
	}
	if got[197:] != "..." {
		t.Errorf("truncateMessage should end with '...', got %q", got[197:])
	}
}
