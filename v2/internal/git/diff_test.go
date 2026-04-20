// Author: Subash Karki
package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// setupDiffRepo creates a temp repo with a known commit history for diff tests.
// Returns (repoPath, firstCommitHash, secondCommitHash).
func setupDiffRepo(t *testing.T) (string, string, string) {
	t.Helper()
	dir := t.TempDir()

	env := append(os.Environ(),
		"GIT_AUTHOR_NAME=Test",
		"GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=Test",
		"GIT_COMMITTER_EMAIL=test@example.com",
	)

	run := func(args ...string) string {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = env
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
		return string(out)
	}

	run("init", "-b", "main")
	run("config", "user.email", "test@example.com")
	run("config", "user.name", "Test")

	// First commit: add hello.txt
	if err := os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("line1\nline2\nline3\n"), 0644); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-m", "first")
	hash1 := run("rev-parse", "HEAD")
	hash1 = trimNL(hash1)

	// Second commit: modify hello.txt + add new.txt
	if err := os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("line1\nline2 changed\nline3\nline4\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "new.txt"), []byte("brand new\n"), 0644); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-m", "second")
	hash2 := run("rev-parse", "HEAD")
	hash2 = trimNL(hash2)

	return dir, hash1, hash2
}

func trimNL(s string) string {
	result := ""
	for _, c := range s {
		if c != '\n' && c != '\r' {
			result += string(c)
		}
	}
	return result
}

func TestChangedFiles(t *testing.T) {
	dir, hash1, hash2 := setupDiffRepo(t)

	files, err := ChangedFiles(context.Background(), dir, hash1, hash2)
	if err != nil {
		t.Fatalf("ChangedFiles: %v", err)
	}

	if len(files) == 0 {
		t.Fatal("expected at least one changed file")
	}

	byName := make(map[string]DiffFile)
	for _, f := range files {
		byName[f.Path] = f
	}

	if _, ok := byName["hello.txt"]; !ok {
		t.Errorf("expected hello.txt in changed files, got: %+v", files)
	}
	if _, ok := byName["new.txt"]; !ok {
		t.Errorf("expected new.txt in changed files, got: %+v", files)
	}

	nt := byName["new.txt"]
	if nt.Additions == 0 {
		t.Errorf("expected additions > 0 for new.txt")
	}
}

func TestFileDiffDetail(t *testing.T) {
	dir, hash1, hash2 := setupDiffRepo(t)

	fd, err := FileDiffDetail(context.Background(), dir, hash1, hash2, "hello.txt")
	if err != nil {
		t.Fatalf("FileDiffDetail: %v", err)
	}

	if fd == nil {
		t.Fatal("expected non-nil FileDiff")
	}
	if len(fd.Hunks) == 0 {
		t.Error("expected at least one hunk")
	}

	// Verify at least one "add" and one "remove" line exist across hunks.
	var hasAdd, hasRemove bool
	for _, hunk := range fd.Hunks {
		for _, line := range hunk.Lines {
			if line.Type == "add" {
				hasAdd = true
			}
			if line.Type == "remove" {
				hasRemove = true
			}
		}
	}
	if !hasAdd {
		t.Error("expected at least one added line in diff")
	}
	if !hasRemove {
		t.Error("expected at least one removed line in diff")
	}
}

func TestStagedChanges(t *testing.T) {
	dir := t.TempDir()

	env := append(os.Environ(),
		"GIT_AUTHOR_NAME=Test",
		"GIT_AUTHOR_EMAIL=test@example.com",
		"GIT_COMMITTER_NAME=Test",
		"GIT_COMMITTER_EMAIL=test@example.com",
	)
	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = env
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	run("init", "-b", "main")
	run("config", "user.email", "test@example.com")
	run("config", "user.name", "Test")

	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("original\n"), 0644); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-m", "base")

	// Stage a change.
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("modified\n"), 0644); err != nil {
		t.Fatal(err)
	}
	run("add", "a.txt")

	staged, err := StagedChanges(context.Background(), dir)
	if err != nil {
		t.Fatalf("StagedChanges: %v", err)
	}
	if len(staged) == 0 {
		t.Error("expected at least one staged file")
	}

	found := false
	for _, f := range staged {
		if f.Path == "a.txt" {
			found = true
		}
	}
	if !found {
		t.Errorf("a.txt not in staged list: %+v", staged)
	}
}

func TestParseNumstat(t *testing.T) {
	cases := []struct {
		line     string
		wantPath string
		wantAdd  int
		wantDel  int
		wantErr  bool
	}{
		{"5\t2\tfoo/bar.go", "foo/bar.go", 5, 2, false},
		{"0\t3\tdeleted.go", "deleted.go", 0, 3, false},
		{"10\t0\tnewfile.go", "newfile.go", 10, 0, false},
		{"-\t-\tbinary.bin", "binary.bin", 0, 0, false},
		{"bad line", "", 0, 0, true},
	}

	for _, tc := range cases {
		df, err := parseNumstat(tc.line)
		if tc.wantErr {
			if err == nil {
				t.Errorf("parseNumstat(%q): expected error, got none", tc.line)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseNumstat(%q): unexpected error: %v", tc.line, err)
			continue
		}
		if df.Path != tc.wantPath {
			t.Errorf("parseNumstat(%q): path = %q, want %q", tc.line, df.Path, tc.wantPath)
		}
		if df.Additions != tc.wantAdd {
			t.Errorf("parseNumstat(%q): additions = %d, want %d", tc.line, df.Additions, tc.wantAdd)
		}
		if df.Deletions != tc.wantDel {
			t.Errorf("parseNumstat(%q): deletions = %d, want %d", tc.line, df.Deletions, tc.wantDel)
		}
	}
}

func TestParseUnifiedDiff(t *testing.T) {
	raw := `@@ -1,3 +1,4 @@
 context line
-old line
+new line
+added line
 another context`

	file := &DiffFile{Path: "test.txt", Status: "modified"}
	hunks := parseUnifiedDiff(raw, file)

	if len(hunks) != 1 {
		t.Fatalf("expected 1 hunk, got %d", len(hunks))
	}

	h := hunks[0]
	if h.OldStart != 1 || h.OldCount != 3 {
		t.Errorf("hunk header: OldStart=%d OldCount=%d, want 1,3", h.OldStart, h.OldCount)
	}
	if h.NewStart != 1 || h.NewCount != 4 {
		t.Errorf("hunk header: NewStart=%d NewCount=%d, want 1,4", h.NewStart, h.NewCount)
	}

	types := make(map[string]int)
	for _, l := range h.Lines {
		types[l.Type]++
	}

	if types["add"] != 2 {
		t.Errorf("expected 2 add lines, got %d", types["add"])
	}
	if types["remove"] != 1 {
		t.Errorf("expected 1 remove line, got %d", types["remove"])
	}
	if types["context"] != 2 {
		t.Errorf("expected 2 context lines, got %d", types["context"])
	}

	if file.Additions != 2 {
		t.Errorf("file.Additions = %d, want 2", file.Additions)
	}
	if file.Deletions != 1 {
		t.Errorf("file.Deletions = %d, want 1", file.Deletions)
	}
}
