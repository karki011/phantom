// Author: Subash Karki
package git

import (
	"path/filepath"
	"strings"
	"sync"
)

// activeProjectRegistry gates which repos deliver fsnotify events.
// Backward compatible: if no active projects are configured, every
// repo behaves as active (existing single-active-user behavior).
type activeProjectRegistry struct {
	mu       sync.RWMutex
	active   map[string]struct{} // canonicalized repo root paths
	gitDirs  map[string]string   // canonicalized git/common dir -> canonical repo root
	enforced bool
}

func newActiveProjectRegistry() *activeProjectRegistry {
	return &activeProjectRegistry{
		active:  make(map[string]struct{}),
		gitDirs: make(map[string]string),
	}
}

// register maps the repo root's git/common dirs to the repo path so events
// inside .git/ can be matched back to a project.
func (r *activeProjectRegistry) register(repoPath, gitDir, commonDir string) {
	canon := canonicalize(repoPath)
	r.mu.Lock()
	if gitDir != "" {
		r.gitDirs[canonicalize(gitDir)] = canon
	}
	if commonDir != "" && commonDir != gitDir {
		r.gitDirs[canonicalize(commonDir)] = canon
	}
	r.mu.Unlock()
}

// setActive replaces the active set. Empty list disables gating.
func (r *activeProjectRegistry) setActive(repoPaths []string) []string {
	next := make(map[string]struct{}, len(repoPaths))
	for _, p := range repoPaths {
		if p == "" {
			continue
		}
		next[canonicalize(p)] = struct{}{}
	}
	r.mu.Lock()
	prev := r.active
	r.active = next
	r.enforced = len(next) > 0
	r.mu.Unlock()

	// Return newly-activated repos so callers can emit a synthetic refresh
	// to catch changes missed while paused.
	resumed := make([]string, 0)
	for p := range next {
		if _, was := prev[p]; !was {
			resumed = append(resumed, p)
		}
	}
	return resumed
}

// isActive returns true when the event should be delivered.
// Resolves both working-tree events (eventPath under repoPath) and
// .git internal events (eventPath under gitDir/commonDir).
func (r *activeProjectRegistry) isActive(eventPath string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if !r.enforced {
		return true
	}
	canon := canonicalize(eventPath)

	// .git internal event: match by registered git/common dir.
	for gd, repo := range r.gitDirs {
		if pathHasPrefix(canon, gd) {
			_, ok := r.active[repo]
			return ok
		}
	}
	// Working tree event: longest-prefix match against active repos.
	var best string
	for repo := range r.active {
		if pathHasPrefix(canon, repo) && len(repo) > len(best) {
			best = repo
		}
	}
	return best != ""
}

func canonicalize(p string) string {
	if p == "" {
		return ""
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return filepath.Clean(p)
	}
	return filepath.Clean(abs)
}

func pathHasPrefix(path, prefix string) bool {
	if prefix == "" {
		return false
	}
	if path == prefix {
		return true
	}
	sep := string(filepath.Separator)
	if !strings.HasSuffix(prefix, sep) {
		prefix += sep
	}
	return strings.HasPrefix(path, prefix)
}
