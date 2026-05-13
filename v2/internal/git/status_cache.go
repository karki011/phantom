// Author: Subash Karki
package git

import (
	"context"
	"strings"
	"sync"
	"time"
)

const statusCacheTTL = 2 * time.Second

// statusCacheEntry holds parsed git status maps and refresh timestamp.
//   - statusMap: relPath -> XY porcelain code
//   - dirStatusMap: parent dir relPath -> representative XY code (for O(1) dir badges)
type statusCacheEntry struct {
	statusMap    map[string]string
	dirStatusMap map[string]string
	lastRefresh  time.Time
}

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

// getCachedStatus returns the git status map for repoPath (2s TTL).
func getCachedStatus(ctx context.Context, repoPath string) map[string]string {
	m, _ := getCachedStatusAndDirs(ctx, repoPath)
	return m
}

// getCachedStatusAndDirs returns both the file status map and the directory
// rollup map. The directory map enables O(1) badge lookups for parent dirs
// (every ancestor path of every changed file is a key).
func getCachedStatusAndDirs(ctx context.Context, repoPath string) (map[string]string, map[string]string) {
	statusCache.RLock()
	entry, ok := statusCache.entries[repoPath]
	statusCache.RUnlock()

	if ok && time.Since(entry.lastRefresh) < statusCacheTTL {
		return entry.statusMap, entry.dirStatusMap
	}

	statusMap := parseGitStatus(ctx, repoPath)
	dirMap := buildDirStatusMap(statusMap)

	statusCache.Lock()
	statusCache.entries[repoPath] = &statusCacheEntry{
		statusMap:    statusMap,
		dirStatusMap: dirMap,
		lastRefresh:  time.Now(),
	}
	statusCache.Unlock()

	return statusMap, dirMap
}

// parseGitStatus runs `git status --porcelain=v2` and returns the path→XY map,
// unifying on the same v2 format used by GetRepoStatus.
func parseGitStatus(ctx context.Context, repoPath string) map[string]string {
	statusMap := make(map[string]string)
	out, err := runGit(ctx, repoPath, "status", "--porcelain=v2")
	if err != nil || out == "" {
		return statusMap
	}

	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}

		switch {
		case strings.HasPrefix(line, "1 "):
			// "1 XY sub mH mI mW hH hI path"
			fields := strings.Fields(line[2:])
			if len(fields) >= 8 {
				statusMap[fields[7]] = fields[0]
			}

		case strings.HasPrefix(line, "2 "):
			// "2 XY sub mH mI mW hH hI X score path\torigPath"
			rest := line[2:]
			tabIdx := strings.Index(rest, "\t")
			if tabIdx < 0 {
				continue
			}
			fields := strings.Fields(rest[:tabIdx])
			if len(fields) >= 9 {
				statusMap[fields[8]] = fields[0]
			}

		case strings.HasPrefix(line, "u "):
			// "u XY sub m1 m2 m3 mW h1 h2 h3 path"
			fields := strings.Fields(line[2:])
			if len(fields) >= 10 {
				statusMap[fields[9]] = "UU"
			}

		case strings.HasPrefix(line, "? "):
			statusMap[strings.TrimPrefix(line, "? ")] = "??"
		}
	}

	return statusMap
}

// buildDirStatusMap walks each changed file path and tags every ancestor
// directory with the file's status. First write wins — a directory only
// needs one badge regardless of how many children are dirty.
func buildDirStatusMap(statusMap map[string]string) map[string]string {
	dirMap := make(map[string]string, len(statusMap))
	for filePath, status := range statusMap {
		for {
			idx := strings.LastIndexByte(filePath, '/')
			if idx < 0 {
				break
			}
			filePath = filePath[:idx]
			if _, exists := dirMap[filePath]; exists {
				break
			}
			dirMap[filePath] = status
		}
	}
	return dirMap
}
