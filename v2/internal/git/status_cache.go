// Author: Subash Karki
package git

import (
	"context"
	"strings"
	"sync"
	"time"
)

const statusCacheTTL = 2 * time.Second

// statusCacheEntry holds a parsed git status map and its refresh timestamp.
type statusCacheEntry struct {
	statusMap   map[string]string
	lastRefresh time.Time
}

// statusCache is a simple TTL cache for `git status --porcelain` results.
// Keyed by repo path. Safe for concurrent access.
var statusCache = struct {
	sync.RWMutex
	entries map[string]*statusCacheEntry
}{entries: make(map[string]*statusCacheEntry)}

// InvalidateStatusCache removes the cached status for a given repo path.
// Called by the file watcher when git state changes.
func InvalidateStatusCache(repoPath string) {
	statusCache.Lock()
	delete(statusCache.entries, repoPath)
	statusCache.Unlock()
}

// InvalidateAllStatusCaches clears every cached entry.
func InvalidateAllStatusCaches() {
	statusCache.Lock()
	statusCache.entries = make(map[string]*statusCacheEntry)
	statusCache.Unlock()
}

// getCachedStatus returns the git status map for repoPath, using a 2-second
// TTL cache to avoid running `git status --porcelain` on every ListDirectory call.
func getCachedStatus(ctx context.Context, repoPath string) map[string]string {
	statusCache.RLock()
	entry, ok := statusCache.entries[repoPath]
	statusCache.RUnlock()

	if ok && time.Since(entry.lastRefresh) < statusCacheTTL {
		return entry.statusMap
	}

	// Cache miss or stale — refresh.
	statusMap := parseGitStatus(ctx, repoPath)

	statusCache.Lock()
	statusCache.entries[repoPath] = &statusCacheEntry{
		statusMap:   statusMap,
		lastRefresh: time.Now(),
	}
	statusCache.Unlock()

	return statusMap
}

// parseGitStatus runs `git status --porcelain` and returns the path→status map.
func parseGitStatus(ctx context.Context, repoPath string) map[string]string {
	statusMap := make(map[string]string)
	out, err := runGit(ctx, repoPath, "status", "--porcelain")
	if err != nil || out == "" {
		return statusMap
	}
	for _, line := range strings.Split(out, "\n") {
		if len(line) < 4 {
			continue
		}
		xy := strings.TrimSpace(line[:2])
		filePath := strings.TrimSpace(line[3:])
		// Rename format: "oldpath -> newpath"
		if idx := strings.Index(filePath, " -> "); idx >= 0 {
			filePath = filePath[idx+4:]
		}
		if xy != "" {
			statusMap[filePath] = xy
		}
	}
	return statusMap
}
