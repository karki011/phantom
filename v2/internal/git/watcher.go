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
	GitEventBranchChanged GitEventType = iota
	GitEventIndexChanged
	GitEventStatusChanged
)

type GitEvent struct {
	Type     GitEventType
	RepoPath string
}

type Watcher struct {
	ctx      context.Context
	cancel   context.CancelFunc
	watcher  *fsnotify.Watcher
	eventCh  chan GitEvent
	mu       sync.Mutex
	debounce map[string]*time.Timer
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
	}
	go w.run()
	return w, nil
}

func (w *Watcher) Events() <-chan GitEvent { return w.eventCh }

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

	if _, err := os.Stat(filepath.Join(gitDir, "HEAD")); err == nil {
		w.watcher.Add(gitDir)
	}

	refsHeads := filepath.Join(commonDir, "refs", "heads")
	if info, err := os.Stat(refsHeads); err == nil && info.IsDir() {
		w.watcher.Add(refsHeads)
	}

	refsRemotes := filepath.Join(commonDir, "refs", "remotes")
	if info, err := os.Stat(refsRemotes); err == nil && info.IsDir() {
		w.watcher.Add(refsRemotes)
		entries, _ := os.ReadDir(refsRemotes)
		for _, e := range entries {
			if e.IsDir() {
				w.watcher.Add(filepath.Join(refsRemotes, e.Name()))
			}
		}
	}

	return nil
}

func (w *Watcher) UnwatchRepo(repoPath string) {
	gitDir := resolveGitDir(repoPath)
	if gitDir != "" {
		w.watcher.Remove(gitDir)
	}
	commonDir := resolveGitCommonDir(repoPath)
	if commonDir != "" && commonDir != gitDir {
		refsHeads := filepath.Join(commonDir, "refs", "heads")
		w.watcher.Remove(refsHeads)
		refsRemotes := filepath.Join(commonDir, "refs", "remotes")
		w.watcher.Remove(refsRemotes)
		entries, _ := os.ReadDir(refsRemotes)
		for _, e := range entries {
			if e.IsDir() {
				w.watcher.Remove(filepath.Join(refsRemotes, e.Name()))
			}
		}
	}
}

func (w *Watcher) Stop() {
	w.cancel()
	w.watcher.Close()
}

func (w *Watcher) run() {
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

	switch {
	case name == "HEAD":
		w.emitDebounced("HEAD:"+dir, GitEventBranchChanged, 0)
	case name == "index":
		w.emitDebounced("index:"+dir, GitEventIndexChanged, 1000*time.Millisecond)
	case name == "FETCH_HEAD":
		w.emitDebounced("FETCH_HEAD:"+dir, GitEventStatusChanged, 500*time.Millisecond)
	case name == "MERGE_HEAD" || name == "REBASE_HEAD" || name == "CHERRY_PICK_HEAD":
		w.emitDebounced("merge:"+dir, GitEventStatusChanged, 0)
	case strings.Contains(event.Name, "refs/heads"):
		w.emitDebounced("refs-heads:"+dir, GitEventStatusChanged, 500*time.Millisecond)
	case strings.Contains(event.Name, "refs/remotes"):
		w.emitDebounced("refs-remotes:"+dir, GitEventStatusChanged, 500*time.Millisecond)
	}
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
