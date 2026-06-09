// Author: Subash Karki
package git

import (
	"context"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const statusCacheTTL = 2 * time.Second

// statusCacheEntry holds parsed git status maps and refresh timestamp.
//   - statusMap: relPath -> XY porcelain code
//   - dirStatusMap: parent dir relPath -> representative XY code (for O(1) dir badges)
//   - gen: monotonic generation this entry's data corresponds to. A refresh
//     captures the repo's generation when it starts; on completion it only
//     stores if no newer invalidation has bumped the generation (W2-4b — stops
//     a slow stale refresh from clobbering fresher state).
type statusCacheEntry struct {
	statusMap    map[string]string
	dirStatusMap map[string]string
	lastRefresh  time.Time
	gen          uint64
}

var statusCache = struct {
	sync.RWMutex
	entries map[string]*statusCacheEntry
	// gen tracks the latest invalidation generation per repo. Bumped on every
	// invalidate so an in-flight refresh can detect it has been superseded.
	gen map[string]uint64
}{entries: make(map[string]*statusCacheEntry), gen: make(map[string]uint64)}

// statusGroup coalesces concurrent git-status refreshes per repo. When the
// sidebar fires several ListDirectory calls at once (or a stale read triggers
// a background refresh), only ONE `git status` runs; the rest share its result.
var statusGroup singleflight.Group

// InvalidateStatusCache marks the cached status for a repo as stale instead of
// deleting it. The next read serves the stale maps instantly and refreshes in
// the background — the sidebar never blocks on a cold `git status`. Called by
// the file watcher when git state changes.
func InvalidateStatusCache(repoPath string) {
	statusCache.Lock()
	statusCache.gen[repoPath]++
	if e, ok := statusCache.entries[repoPath]; ok {
		e.lastRefresh = time.Time{} // zero time => stale, but maps stay servable
	}
	statusCache.Unlock()
}

// InvalidateAllStatusCaches marks every cached entry stale (see
// InvalidateStatusCache). Cheap and non-blocking — stale maps remain servable.
func InvalidateAllStatusCaches() {
	statusCache.Lock()
	for repo := range statusCache.entries {
		statusCache.gen[repo]++
	}
	for _, e := range statusCache.entries {
		e.lastRefresh = time.Time{}
	}
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
		return entry.statusMap, entry.dirStatusMap // fresh hit
	}

	if ok {
		// Stale hit: serve the previous maps instantly and refresh in the
		// background so the sidebar stays responsive. The background `git
		// status` is deduped via singleflight, so a burst of stale reads spawns
		// at most one real refresh. Uses a detached context so the refresh
		// outlives the caller (a cancelled ListDirectory must not abort it).
		go refreshStatusCache(context.WithoutCancel(ctx), repoPath)
		return entry.statusMap, entry.dirStatusMap
	}

	// Cold start: no maps to serve, so block once on a deduped refresh.
	e := refreshStatusCache(ctx, repoPath)
	return e.statusMap, e.dirStatusMap
}

// refreshStatusCache runs `git status` for repoPath and stores the result,
// deduplicating concurrent refreshes for the same repo via singleflight.
//
// A generation guard (W2-4b) prevents a slow refresh from clobbering fresher
// state: we capture the repo's generation before running `git status`, and on
// completion store only if no invalidation bumped the generation in the
// meantime. When superseded, we return the current entry (which a newer
// refresh will reconcile) instead of overwriting it with stale data.
func refreshStatusCache(ctx context.Context, repoPath string) *statusCacheEntry {
	v, _, _ := statusGroup.Do(repoPath, func() (interface{}, error) {
		statusCache.RLock()
		startGen := statusCache.gen[repoPath]
		statusCache.RUnlock()

		statusMap := parseGitStatus(ctx, repoPath)
		dirMap := buildDirStatusMap(statusMap)
		e := &statusCacheEntry{
			statusMap:    statusMap,
			dirStatusMap: dirMap,
			lastRefresh:  time.Now(),
			gen:          startGen,
		}

		statusCache.Lock()
		defer statusCache.Unlock()
		// Stale-win guard: if an invalidation arrived while git ran, our data is
		// stale. Keep the existing entry if it is at least as fresh; otherwise
		// store ours (cold start or only-writer) so the sidebar still gets data.
		if cur, ok := statusCache.entries[repoPath]; ok {
			if statusCache.gen[repoPath] > startGen || cur.gen > startGen {
				return cur, nil
			}
		}
		statusCache.entries[repoPath] = e
		return e, nil
	})
	return v.(*statusCacheEntry)
}

// parseGitStatus runs `git status --porcelain=v2` and returns the path→XY map,
// unifying on the same v2 format used by GetRepoStatus.
//
// --untracked-files=normal reports untracked directories as a single entry
// instead of recursing into every file beneath them. On a worktree with large
// untracked trees (node_modules, build output) this turns a multi-second scan
// into milliseconds — the same trade-off VS Code/JetBrains make. Directory
// badges are preserved: buildDirStatusMap still tags the untracked dir.
func parseGitStatus(ctx context.Context, repoPath string) map[string]string {
	statusMap := make(map[string]string)
	out, err := runGitWithRetry(ctx, repoPath, "status", "--porcelain=v2", "--untracked-files=normal")
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
