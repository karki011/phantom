// Author: Subash Karki
package git

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const gitignoreCacheTTL = 30 * time.Second

// gitignoreRules holds compiled patterns for a single .gitignore file.
type gitignoreRules struct {
	patterns []gitignorePattern
}

// gitignorePattern is a single parsed line from a .gitignore file.
type gitignorePattern struct {
	raw     string
	negate  bool
	dirOnly bool
	// anchored means the pattern has a slash that makes it relative to the root.
	anchored bool
	// prefix is the leading path segment used for prefix matching (e.g. "vendor/")
	prefix string
}

// gitignoreCacheEntry stores compiled rules for one repo root plus a refresh time.
type gitignoreCacheEntry struct {
	rules       []gitignoreRules // ordered root → deepest
	lastRefresh time.Time
}

var gitignoreCache = struct {
	sync.RWMutex
	entries map[string]*gitignoreCacheEntry
}{entries: make(map[string]*gitignoreCacheEntry)}

// InvalidateGitignoreCache removes cached rules for a repo. Called when a
// .gitignore file changes (or when the watcher detects a working-tree write).
func InvalidateGitignoreCache(repoPath string) {
	gitignoreCache.Lock()
	delete(gitignoreCache.entries, repoPath)
	gitignoreCache.Unlock()
}

// InvalidateAllGitignoreCaches clears every cached entry.
func InvalidateAllGitignoreCaches() {
	gitignoreCache.Lock()
	gitignoreCache.entries = make(map[string]*gitignoreCacheEntry)
	gitignoreCache.Unlock()
}

// getCachedGitignoreRules returns the compiled gitignore rules for repoPath,
// reading and parsing .gitignore files from the repo root only (not parents,
// because the watcher already scopes to the repo). Results are cached for
// gitignoreCacheTTL to avoid repeated disk reads on every directory expansion.
func getCachedGitignoreRules(repoPath string) []gitignoreRules {
	gitignoreCache.RLock()
	entry, ok := gitignoreCache.entries[repoPath]
	gitignoreCache.RUnlock()

	if ok && time.Since(entry.lastRefresh) < gitignoreCacheTTL {
		return entry.rules
	}

	rules := loadGitignoreRules(repoPath)

	gitignoreCache.Lock()
	gitignoreCache.entries[repoPath] = &gitignoreCacheEntry{
		rules:       rules,
		lastRefresh: time.Now(),
	}
	gitignoreCache.Unlock()

	return rules
}

// loadGitignoreRules discovers and parses all .gitignore files under repoPath.
// It reads the top-level .gitignore and .git/info/exclude (which git always honours).
// Per-directory .gitignore files are intentionally NOT pre-loaded here — they are
// resolved lazily in isIgnored when needed and are covered by the repo-level rules
// in the vast majority of real projects.
func loadGitignoreRules(repoPath string) []gitignoreRules {
	var all []gitignoreRules

	// Always check .git/info/exclude first (lowest priority, like a global ignore).
	excludePath := filepath.Join(repoPath, ".git", "info", "exclude")
	if r, ok := parseGitignoreFile(excludePath); ok {
		all = append(all, r)
	}

	// Root .gitignore (highest priority for repo-wide rules).
	rootIgnore := filepath.Join(repoPath, ".gitignore")
	if r, ok := parseGitignoreFile(rootIgnore); ok {
		all = append(all, r)
	}

	return all
}

// parseGitignoreFile reads one .gitignore file and compiles its patterns.
func parseGitignoreFile(path string) (gitignoreRules, bool) {
	f, err := os.Open(path)
	if err != nil {
		return gitignoreRules{}, false
	}
	defer f.Close()

	var patterns []gitignorePattern
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if p, ok := compilePattern(line); ok {
			patterns = append(patterns, p)
		}
	}
	return gitignoreRules{patterns: patterns}, true
}

// compilePattern parses a single .gitignore line into a gitignorePattern.
// Returns (pattern, true) when the line represents an actionable rule.
func compilePattern(line string) (gitignorePattern, bool) {
	// Strip trailing spaces that are not escaped.
	trimmed := strings.TrimRight(line, " \t")
	if trimmed == "" || strings.HasPrefix(trimmed, "#") {
		return gitignorePattern{}, false
	}

	p := gitignorePattern{raw: trimmed}

	// Negation.
	if strings.HasPrefix(trimmed, "!") {
		p.negate = true
		trimmed = trimmed[1:]
	}

	// Trailing slash means directory-only.
	if strings.HasSuffix(trimmed, "/") {
		p.dirOnly = true
		trimmed = strings.TrimSuffix(trimmed, "/")
	}

	// A pattern is anchored (relative to repo root) if it contains a slash
	// anywhere other than at the trailing position we just stripped.
	if strings.Contains(trimmed, "/") {
		p.anchored = true
		// Remove optional leading slash so we can do HasPrefix matching.
		trimmed = strings.TrimPrefix(trimmed, "/")
		p.prefix = trimmed
	}

	p.raw = trimmed
	return p, true
}

// isIgnoredByRules reports whether a repo-relative path should be treated as
// ignored according to the provided rule sets. It implements the git semantics
// where later rules override earlier ones, and negation un-ignores a path.
//
// Parameters:
//   - rules: rule sets from getCachedGitignoreRules (in load order)
//   - relPath: path relative to repo root, using forward slashes (e.g. "vendor/foo.go")
//   - isDir: whether the entry is a directory
func isIgnoredByRules(rules []gitignoreRules, relPath string, isDir bool) bool {
	// Normalise separators.
	relPath = filepath.ToSlash(relPath)
	ignored := false

	for _, rs := range rules {
		for _, p := range rs.patterns {
			if p.dirOnly && !isDir {
				continue
			}

			matched := matchPattern(p, relPath)
			if matched {
				if p.negate {
					ignored = false
				} else {
					ignored = true
				}
			}
		}
	}
	return ignored
}

// matchPattern reports whether relPath matches the gitignore pattern p.
// relPath uses forward slashes and is relative to the repo root.
func matchPattern(p gitignorePattern, relPath string) bool {
	name := filepath.Base(relPath)

	if p.anchored {
		// Anchored: match against the full relative path using simple prefix/glob logic.
		// This covers the common "vendor/", "dist/", "node_modules/" patterns exactly.
		pattern := p.prefix

		// Exact prefix match (covers paths like "dist/bundle.js" matching pattern "dist").
		if relPath == pattern {
			return true
		}
		if strings.HasPrefix(relPath, pattern+"/") {
			return true
		}
		// Fall through to fnmatch-style glob on full path.
		matched, _ := filepath.Match(pattern, relPath)
		return matched
	}

	// Unanchored: match the base name only (standard glob). This covers the
	// overwhelmingly common ".DS_Store", "*.log", "*.pyc" patterns.
	matched, _ := filepath.Match(p.raw, name)
	return matched
}
