// CWD normalization and matching for terminal-to-session linking.
// Author: Subash Karki
package linker

import (
	"path/filepath"
	"strings"
)

// NormalizeCWD resolves symlinks (with fallback to Clean) and strips the
// trailing slash. The result is always an absolute, canonical path.
func NormalizeCWD(path string) string {
	if path == "" {
		return ""
	}

	// Try symlink resolution first; fall back to Clean on failure.
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		resolved = filepath.Clean(path)
	}

	// Strip trailing slash unless the path is root "/".
	if len(resolved) > 1 {
		resolved = strings.TrimRight(resolved, "/")
	}

	return resolved
}

// CWDsMatch returns true when a and b share a segment-level prefix
// (or are an exact match) after normalisation.
//
// Segment-level comparison is critical: "/a/project" must NOT match
// "/a/project-other" — using string HasPrefix would be incorrect.
func CWDsMatch(a, b string) bool {
	na := NormalizeCWD(a)
	nb := NormalizeCWD(b)

	if na == "" || nb == "" {
		return false
	}

	segA := strings.Split(na, "/")
	segB := strings.Split(nb, "/")

	// Determine shorter and longer segment slices.
	shorter, longer := segA, segB
	if len(segA) > len(segB) {
		shorter, longer = segB, segA
	}

	// Every segment in the shorter path must match the corresponding segment
	// in the longer path.
	for i, seg := range shorter {
		if seg != longer[i] {
			return false
		}
	}

	return true
}
