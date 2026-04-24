// Run with: go test -race -v ./internal/linker/...
// Author: Subash Karki
//
//go:build !windows

package linker

import (
	"os"
	"path/filepath"
	"testing"
)

// ---------------------------------------------------------------------------
// NormalizeCWD
// ---------------------------------------------------------------------------

func TestNormalizeCWD_TrailingSlash(t *testing.T) {
	t.Parallel()
	got := NormalizeCWD("/Users/foo/project/")
	want := "/Users/foo/project"
	if got != want {
		t.Fatalf("NormalizeCWD(%q) = %q, want %q", "/Users/foo/project/", got, want)
	}
}

func TestNormalizeCWD_DoubleSlash(t *testing.T) {
	t.Parallel()
	got := NormalizeCWD("/Users//foo/project")
	want := "/Users/foo/project"
	if got != want {
		t.Fatalf("NormalizeCWD(%q) = %q, want %q", "/Users//foo/project", got, want)
	}
}

func TestNormalizeCWD_Root(t *testing.T) {
	t.Parallel()
	got := NormalizeCWD("/")
	if got != "/" {
		t.Fatalf("NormalizeCWD(%q) = %q, want %q", "/", got, "/")
	}
}

func TestNormalizeCWD_Empty(t *testing.T) {
	t.Parallel()
	got := NormalizeCWD("")
	if got != "" {
		t.Fatalf("NormalizeCWD(%q) = %q, want %q", "", got, "")
	}
}

func TestNormalizeCWD_Symlink(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	realDir := filepath.Join(dir, "real")
	linkDir := filepath.Join(dir, "link")

	if err := os.Mkdir(realDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(realDir, linkDir); err != nil {
		t.Fatal(err)
	}

	got := NormalizeCWD(linkDir)
	// On macOS, the tempdir path itself may contain symlinks (e.g. /var → /private/var),
	// so resolve realDir the same way for comparison.
	wantResolved := NormalizeCWD(realDir)
	if got != wantResolved {
		t.Fatalf("NormalizeCWD(%q) = %q, want %q (resolved symlink)", linkDir, got, wantResolved)
	}
}

func TestNormalizeCWD_BrokenSymlink(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	brokenLink := filepath.Join(dir, "broken")

	// Create symlink pointing to a non-existent target.
	if err := os.Symlink("/no/such/path/target", brokenLink); err != nil {
		t.Fatal(err)
	}

	got := NormalizeCWD(brokenLink)
	want := filepath.Clean(brokenLink)
	if got != want {
		t.Fatalf("NormalizeCWD(broken symlink) = %q, want %q (Clean fallback)", got, want)
	}
}

// ---------------------------------------------------------------------------
// CWDsMatch
// ---------------------------------------------------------------------------

func TestCWDsMatch(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		a    string
		b    string
		want bool
	}{
		{name: "exact match", a: "/a/b", b: "/a/b", want: true},
		{name: "parent-child", a: "/a", b: "/a/b/c", want: true},
		{name: "child-parent", a: "/a/b/c", b: "/a", want: true},
		{name: "similar prefix (CRITICAL)", a: "/a/project", b: "/a/project-other", want: false},
		{name: "unrelated", a: "/a/b", b: "/c/d", want: false},
		{name: "root vs anything", a: "/", b: "/anything", want: false},
		{name: "empty left", a: "", b: "/a", want: false},
		{name: "empty right", a: "/a", b: "", want: false},
		{name: "both empty", a: "", b: "", want: false},
		{name: "trailing slashes", a: "/a/b/", b: "/a/b", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := CWDsMatch(tt.a, tt.b)
			if got != tt.want {
				t.Fatalf("CWDsMatch(%q, %q) = %v, want %v", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestCWDsMatch_MacOSTmpSymlink(t *testing.T) {
	t.Parallel()

	// On macOS, /tmp is a symlink to /private/tmp.
	// This test verifies that symlink resolution makes them match.
	target, err := filepath.EvalSymlinks("/tmp")
	if err != nil {
		t.Skipf("cannot resolve /tmp symlink: %v", err)
	}

	// Only meaningful if /tmp actually resolves to something different.
	if target == "/tmp" {
		t.Skip("/tmp is not a symlink on this system")
	}

	dir := t.TempDir() // e.g. /tmp/TestXXX → /private/tmp/TestXXX
	symDir := "/tmp/" + filepath.Base(dir)

	// Verify the symlink path actually exists via /tmp.
	if _, err := os.Stat(symDir); err != nil {
		t.Skipf("/tmp alias not accessible: %v", err)
	}

	got := CWDsMatch(symDir, dir)
	if !got {
		t.Fatalf("CWDsMatch(%q, %q) = false, want true (symlink resolution)", symDir, dir)
	}
}
