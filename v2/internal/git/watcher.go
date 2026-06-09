// Author: Subash Karki
package git

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"
	"github.com/fsnotify/fsnotify"
)

type GitEventType int

const (
	GitEventBranchChanged      GitEventType = iota
	GitEventIndexChanged
	GitEventStatusChanged
	GitEventWorkingTreeChanged
)

type GitEvent struct {
	Type     GitEventType
	RepoPath string
}

// maxWatches caps the number of fsnotify subscriptions across all repos.
// macOS exhausts inode watch slots far earlier than Linux; staying under a
// sane ceiling avoids silent watch drops (lost events → stale status) and the
// fd pressure that contributed to the v0.1.65 multi-project crash. When the
// count crosses warnWatchThreshold we log once and stop descending into deeper
// working-tree dirs (graceful degrade — .git refs stay watched).
const (
	maxWatches         = 2048
	warnWatchThreshold = maxWatches * 8 / 10 // ~80%
)

type Watcher struct {
	ctx      context.Context
	cancel   context.CancelFunc
	watcher  *fsnotify.Watcher
	eventCh  chan GitEvent
	mu       sync.Mutex
	debounce map[string]*time.Timer
	active   *activeProjectRegistry
	done     chan struct{} // closed by run() on exit; Stop() waits on it
	stopOnce sync.Once     // guards Stop() so it is idempotent and waits once

	// watched tracks every path successfully added to fsnotify so Unwatch can
	// remove exactly what was added (no orphan accumulation across project
	// switches) and so the soft cap can be enforced. Guarded by mu.
	watched   map[string]struct{}
	watchWarn bool // soft-cap warning already logged

	// statusDebouncer coalesces rapid status-related events (working tree,
	// index, status) into a single emission with a 5s cooldown — matching
	// VS Code's 3-tier suppression pattern. Branch changes bypass this.
	statusDebouncer *Debouncer
}

func NewWatcher(ctx context.Context) (*Watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	wCtx, cancel := context.WithCancel(ctx)
	w := &Watcher{
		ctx:      wCtx,
		cancel:   cancel,
		watcher:  fsw,
		eventCh:  make(chan GitEvent, 32),
		debounce: make(map[string]*time.Timer),
		active:   newActiveProjectRegistry(),
		done:     make(chan struct{}),
		watched:  make(map[string]struct{}),
	}

	// VS Code-style 3-tier suppression for status events:
	//   FS events → debounce(1s) → emit → cooldown(5s)
	// This prevents excessive git-status refreshes during rapid file saves
	// (e.g., Claude writing multiple files, IDE auto-save, build output).
	w.statusDebouncer = NewDebouncer(1*time.Second, 5*time.Second, func() {
		select {
		case w.eventCh <- GitEvent{Type: GitEventStatusChanged}:
			log.Debug("git/Watcher: status debouncer fired")
		default:
		}
	})

	go w.run()
	return w, nil
}

func (w *Watcher) Events() <-chan GitEvent { return w.eventCh }

// SetActiveProjects narrows event delivery to the given repo roots. Passing an
// empty slice restores backward-compatible "all active" behavior. Repos that
// transition from paused to active receive one synthetic refresh event to
// catch changes missed while paused.
func (w *Watcher) SetActiveProjects(repoPaths []string) {
	if w == nil || w.active == nil {
		return
	}
	resumed := w.active.setActive(repoPaths)
	for range resumed {
		select {
		case w.eventCh <- GitEvent{Type: GitEventStatusChanged}:
		default:
		}
	}
}

// SetActiveProject is a convenience for the single-focused-project case.
func (w *Watcher) SetActiveProject(repoPath string) {
	if repoPath == "" {
		w.SetActiveProjects(nil)
		return
	}
	w.SetActiveProjects([]string{repoPath})
}

// addWatch subscribes path to fsnotify, tracking it for later removal and
// enforcing the soft cap. Returns false when the cap is hit so callers can
// stop descending into deeper directories. Idempotent: re-adding a tracked
// path is a no-op (fsnotify.Add itself is idempotent, but we skip the syscall).
func (w *Watcher) addWatch(path string) bool {
	w.mu.Lock()
	if _, ok := w.watched[path]; ok {
		w.mu.Unlock()
		return true
	}
	count := len(w.watched)
	if count >= maxWatches {
		w.mu.Unlock()
		return false
	}
	if count >= warnWatchThreshold && !w.watchWarn {
		w.watchWarn = true
		log.Warn("git/Watcher: approaching fsnotify watch ceiling; deeper dirs will be skipped",
			"watched", count, "ceiling", maxWatches)
	}
	w.mu.Unlock()

	if err := w.watcher.Add(path); err != nil {
		log.Debug("git/Watcher: fsnotify add failed", "path", path, "err", err)
		return true // not a cap stop; keep trying siblings
	}

	w.mu.Lock()
	w.watched[path] = struct{}{}
	w.mu.Unlock()
	return true
}

// removeWatch unsubscribes path from fsnotify and stops tracking it. Safe to
// call for paths never added (no-op).
func (w *Watcher) removeWatch(path string) {
	w.mu.Lock()
	_, ok := w.watched[path]
	if ok {
		delete(w.watched, path)
	}
	w.mu.Unlock()
	if ok {
		w.watcher.Remove(path)
	}
}

func (w *Watcher) WatchRepo(repoPath string) error {
	gitDir := resolveGitDir(repoPath)
	if gitDir == "" {
		return fmt.Errorf("cannot find .git dir for %s", repoPath)
	}
	commonDir := resolveGitCommonDir(repoPath)
	if commonDir == "" {
		commonDir = gitDir
	}

	log.Info("git/Watcher: watching repo", "repoPath", repoPath, "gitDir", gitDir, "commonDir", commonDir)

	w.active.register(repoPath, gitDir, commonDir)

	if _, err := os.Stat(filepath.Join(gitDir, "HEAD")); err == nil {
		w.addWatch(gitDir)
	}

	refsHeads := filepath.Join(commonDir, "refs", "heads")
	if info, err := os.Stat(refsHeads); err == nil && info.IsDir() {
		w.addWatch(refsHeads)
	}

	refsRemotes := filepath.Join(commonDir, "refs", "remotes")
	if info, err := os.Stat(refsRemotes); err == nil && info.IsDir() {
		w.addWatch(refsRemotes)
		entries, _ := os.ReadDir(refsRemotes)
		for _, e := range entries {
			if e.IsDir() {
				w.addWatch(filepath.Join(refsRemotes, e.Name()))
			}
		}
	}

	refsTags := filepath.Join(commonDir, "refs", "tags")
	if info, err := os.Stat(refsTags); err == nil && info.IsDir() {
		w.addWatch(refsTags)
	}

	// Watch worktrees metadata so external `git worktree add/remove/prune`
	// is reflected in the sidebar. Each worktree gets its own subdir under
	// .git/worktrees/<name>/ — watch the parent so create/remove fires, and
	// each existing subdir so internal changes (HEAD moves, locks) fire too.
	worktreesDir := filepath.Join(commonDir, "worktrees")
	if info, err := os.Stat(worktreesDir); err == nil && info.IsDir() {
		w.addWatch(worktreesDir)
		entries, _ := os.ReadDir(worktreesDir)
		for _, e := range entries {
			if e.IsDir() {
				w.addWatch(filepath.Join(worktreesDir, e.Name()))
			}
		}
	}

	// Watch working tree root for file changes (like VS Code's ** watcher).
	// fsnotify is non-recursive, so we watch top-level dirs only.
	// This catches most edits (Claude writes to src/, etc.)
	w.addWatch(repoPath)
	w.watchWorkingTreeDirs(repoPath, 0)

	return nil
}

// watchWorkingTreeDirs recursively watches subdirectories up to maxDepth.
// Skips .git, node_modules, dist, and other heavy/irrelevant dirs. When the
// soft cap is reached (addWatch returns false), it stops descending — deeper
// dirs are skipped rather than silently dropped over the OS inode limit.
func (w *Watcher) watchWorkingTreeDirs(root string, depth int) {
	const maxDepth = 4
	if depth > maxDepth {
		return
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if isIgnoredDir(name) {
			continue
		}
		dir := filepath.Join(root, name)
		if !w.addWatch(dir) {
			return // cap hit: stop descending, degrade gracefully
		}
		w.watchWorkingTreeDirs(dir, depth+1)
	}
}

var ignoredDirs = map[string]bool{
	".git": true, "node_modules": true, "dist": true, ".turbo": true,
	".next": true, ".nuxt": true, "__pycache__": true, ".venv": true,
	"vendor": true, ".idea": true, ".vscode": true, "build": true,
	".cache": true, "coverage": true,
}

func isIgnoredDir(name string) bool {
	return ignoredDirs[name]
}

// UnwatchRepo removes every path this repo contributed to fsnotify. It removes
// by the tracked set rather than re-deriving paths so it cannot leak orphans
// when the on-disk layout changed since WatchRepo ran (W2-5): self-extended
// worktree/refs subdirs, depth-capped working-tree dirs, and dirs that no
// longer exist are all still untracked here. The prefix sweep at the end
// catches anything added under this repo's roots after the initial watch.
func (w *Watcher) UnwatchRepo(repoPath string) {
	gitDir := resolveGitDir(repoPath)
	commonDir := resolveGitCommonDir(repoPath)
	if commonDir == "" {
		commonDir = gitDir
	}

	roots := make([]string, 0, 3)
	roots = append(roots, canonicalize(repoPath))
	if gitDir != "" {
		roots = append(roots, canonicalize(gitDir))
	}
	if commonDir != "" && commonDir != gitDir {
		roots = append(roots, canonicalize(commonDir))
	}

	// Snapshot tracked paths whose canonical form sits under any root, then
	// remove outside the watched-set walk to keep removeWatch's locking simple.
	w.mu.Lock()
	var toRemove []string
	for p := range w.watched {
		cp := canonicalize(p)
		for _, root := range roots {
			if pathHasPrefix(cp, root) {
				toRemove = append(toRemove, p)
				break
			}
		}
	}
	w.mu.Unlock()

	for _, p := range toRemove {
		w.removeWatch(p)
	}
}

// Stop synchronizes with the run() loop before tearing down so an in-flight
// handleEvent can never touch a closed fsnotify watcher (W1-4). Sequence:
//  1. cancel ctx so run() exits its select on the next iteration
//  2. close fsnotify, which also unblocks a run() goroutine parked on Events
//  3. wait for run() to actually return (done) — guarantees no handleEvent is
//     executing past this point
//  4. stop the debouncer last, after the only goroutine that calls Trigger()
//     has exited, so no timer can be re-armed after Stop()
// Idempotent: the once guard makes repeated Stop() calls safe.
func (w *Watcher) Stop() {
	w.stopOnce.Do(func() {
		w.cancel()
		w.watcher.Close()
		<-w.done
		if w.statusDebouncer != nil {
			w.statusDebouncer.Stop()
		}
	})
}

func (w *Watcher) run() {
	defer close(w.done)
	for {
		select {
		case <-w.ctx.Done():
			return
		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}
			if event.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Remove|fsnotify.Rename) == 0 {
				continue
			}
			w.handleEvent(event)
		case err, ok := <-w.watcher.Errors:
			if !ok {
				return
			}
			log.Error("git/Watcher: fsnotify error", "err", err)
		}
	}
}

func (w *Watcher) handleEvent(event fsnotify.Event) {
	name := filepath.Base(event.Name)
	dir := filepath.Dir(event.Name)

	// Skip lockfiles and editor temp files anywhere in the tree. Git takes
	// .lock briefly even for read-only ops (esp. inside linked worktrees),
	// and reacting to it loops: refresh -> git lock -> fsnotify -> refresh.
	if strings.HasSuffix(name, ".lock") || strings.HasSuffix(name, "~") || strings.HasPrefix(name, ".#") {
		return
	}

	// Gate early: when the user has narrowed the active set, drop events for
	// paused projects before doing any further work. Keeps fsnotify subscribed
	// (no state loss) but suppresses downstream cost.
	if !w.active.isActive(event.Name) {
		return
	}

	// .git internal events
	if strings.Contains(event.Name, ".git") {
		// Self-extend: when a new directory appears under refs/remotes,
		// refs/tags, or worktrees, watch it so its internal changes fire.
		if event.Op&fsnotify.Create != 0 {
			if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
				switch {
				case strings.Contains(event.Name, "refs/remotes"),
					strings.Contains(event.Name, "/worktrees/"),
					strings.HasSuffix(event.Name, "/worktrees"):
					w.watcher.Add(event.Name)
				}
			}
		}

		switch {
		case name == "HEAD":
			// Branch changes are immediate — user expects instant feedback.
			w.emitDebounced("HEAD:"+dir, GitEventBranchChanged, 0)
		case name == "MERGE_HEAD" || name == "REBASE_HEAD" || name == "CHERRY_PICK_HEAD":
			// Merge/rebase state changes are immediate — user-initiated.
			// Emitted directly (delay=0) to bypass cooldown.
			w.emitDebounced("merge:"+dir, GitEventStatusChanged, 0)
		case name == "stash":
			// Stash is immediate — explicit user action.
			// Emitted directly (delay=0) to bypass cooldown.
			w.emitDebounced("stash:"+dir, GitEventStatusChanged, 0)
		case name == "index":
			// Index changes go through the global debounce+cooldown gate.
			w.statusDebouncer.Trigger()
		case name == "FETCH_HEAD",
			name == "packed-refs",
			name == "config":
			// Background git ops — route through debounce+cooldown.
			w.statusDebouncer.Trigger()
		case strings.Contains(event.Name, "/worktrees"):
			// External worktree add/remove — route through debounce+cooldown.
			w.statusDebouncer.Trigger()
		case strings.Contains(event.Name, "refs/heads"),
			strings.Contains(event.Name, "refs/remotes"),
			strings.Contains(event.Name, "refs/tags"):
			// Ref updates — route through debounce+cooldown.
			w.statusDebouncer.Trigger()
		}
		return
	}

	// Invalidate gitignore cache when a .gitignore file changes so the next
	// ListDirectory call re-parses rules without spawning a subprocess.
	if name == ".gitignore" {
		// Walk up from the changed file's directory to find the repo root, then
		// invalidate. We resolve by walking up until we find a .git directory.
		repoRoot := findRepoRoot(dir)
		if repoRoot != "" {
			InvalidateGitignoreCache(repoRoot)
		}
	}

	// Working tree file change — routed through the VS Code-style debounce+cooldown.
	// The per-key debounce in emitDebounced still coalesces per-dir bursts, but the
	// final emission goes through statusDebouncer for the global cooldown gate.
	w.statusDebouncer.Trigger()
}

func (w *Watcher) emitDebounced(key string, eventType GitEventType, delay time.Duration) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if existing, ok := w.debounce[key]; ok {
		existing.Stop()
	}

	emit := func() {
		select {
		case w.eventCh <- GitEvent{Type: eventType}:
		default:
		}
		w.mu.Lock()
		delete(w.debounce, key)
		w.mu.Unlock()
	}

	if delay == 0 {
		delete(w.debounce, key)
		go emit()
	} else {
		w.debounce[key] = time.AfterFunc(delay, emit)
	}
}

func resolveGitDir(repoPath string) string {
	dotGit := filepath.Join(repoPath, ".git")
	info, err := os.Stat(dotGit)
	if err != nil {
		return ""
	}
	if info.IsDir() {
		return dotGit
	}
	data, err := os.ReadFile(dotGit)
	if err != nil {
		return ""
	}
	line := strings.TrimSpace(string(data))
	if !strings.HasPrefix(line, "gitdir: ") {
		return ""
	}
	gitDir := strings.TrimPrefix(line, "gitdir: ")
	if !filepath.IsAbs(gitDir) {
		gitDir = filepath.Join(repoPath, gitDir)
	}
	return filepath.Clean(gitDir)
}

func resolveGitCommonDir(repoPath string) string {
	gitDir := resolveGitDir(repoPath)
	if gitDir == "" {
		return ""
	}
	commonDirFile := filepath.Join(gitDir, "commondir")
	data, err := os.ReadFile(commonDirFile)
	if err != nil {
		return gitDir
	}
	commonDir := strings.TrimSpace(string(data))
	if !filepath.IsAbs(commonDir) {
		commonDir = filepath.Join(gitDir, commonDir)
	}
	return filepath.Clean(commonDir)
}

// findRepoRoot walks up from dir until it finds a directory containing a .git
// entry (file or directory). Returns "" if no repo root is found.
func findRepoRoot(dir string) string {
	for {
		if resolveGitDir(dir) != "" {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			// Reached the filesystem root without finding a repo.
			return ""
		}
		dir = parent
	}
}
