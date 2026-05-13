// Author: Subash Karki
//go:build perf

package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// repoRoot resolves to the phantom-os git root for benchmarking against this repo itself.
func repoRoot(b *testing.B) string {
	b.Helper()
	wd, err := os.Getwd()
	if err != nil {
		b.Fatalf("getwd: %v", err)
	}
	// /v2/internal/git → /
	root, err := filepath.Abs(filepath.Join(wd, "..", "..", ".."))
	if err != nil {
		b.Fatalf("abs: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, ".git")); err != nil {
		b.Skipf("no .git at %s (expected for some envs): %v", root, err)
	}
	return root
}

func BenchmarkGetWorktreeStatus(b *testing.B) {
	root := repoRoot(b)
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := GetWorktreeStatus(ctx, root)
		if err != nil {
			b.Fatalf("status: %v", err)
		}
	}
}

func BenchmarkGetRepoStatus(b *testing.B) {
	root := repoRoot(b)
	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := GetRepoStatus(ctx, root)
		if err != nil {
			b.Fatalf("repo status: %v", err)
		}
	}
}

func BenchmarkGetDefaultBranch(b *testing.B) {
	root := repoRoot(b)
	ctx := context.Background()
	InvalidateDefaultBranchCache(root)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = GetDefaultBranch(ctx, root)
	}
}

func BenchmarkGetDefaultBranchCached(b *testing.B) {
	root := repoRoot(b)
	ctx := context.Background()
	_ = GetDefaultBranch(ctx, root) // prime cache
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = GetDefaultBranch(ctx, root)
	}
}

func BenchmarkListDirectory(b *testing.B) {
	root := repoRoot(b)
	ctx := context.Background()
	dir := filepath.Join(root, "v2", "internal", "git")
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := ListDirectory(ctx, root, dir)
		if err != nil {
			b.Fatalf("listdir: %v", err)
		}
	}
}

func BenchmarkLogFastVsCLI(b *testing.B) {
	root := repoRoot(b)
	ctx := context.Background()

	b.Run("LogFast", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			_, _ = LogFast(ctx, root, 50)
		}
	})
	b.Run("logCLI", func(b *testing.B) {
		for i := 0; i < b.N; i++ {
			_, _ = logCLI(ctx, root, 50, 0)
		}
	})
}

func BenchmarkAheadBehindFast(b *testing.B) {
	root := repoRoot(b)
	ctx := context.Background()
	branch, err := exec.CommandContext(ctx, "git", "-C", root, "rev-parse", "--abbrev-ref", "HEAD").Output()
	if err != nil {
		b.Skipf("no HEAD: %v", err)
	}
	br := string(branch)
	br = br[:len(br)-1] // strip newline
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, _ = AheadBehindFast(ctx, root, br)
	}
}
