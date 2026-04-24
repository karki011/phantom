// Background goroutines for periodic git operations.
// Author: Subash Karki
package app

import (
	"encoding/json"
	"time"

	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// startGitHubPoller watches the active worktree and emits pr:updated, ci:updated,
// or prs:list-updated only when the data actually changes. Polling interval is adaptive:
// 10s when any CI run is still pending, 60s otherwise.
func (a *App) startGitHubPoller() {
	var (
		cachedPr      string // JSON of last-emitted *git.PrStatus
		cachedCi      string // JSON of last-emitted []git.CiRun
		cachedPrsList string // JSON of last-emitted []git.PrStatus
		lastWorktree  string
	)

	marshalOrEmpty := func(v any) string {
		b, _ := json.Marshal(v)
		return string(b)
	}

	poll := func() time.Duration {
		a.watchedMu.RLock()
		wtId := a.watchedWorktree
		a.watchedMu.RUnlock()

		if wtId == "" {
			return 5 * time.Second
		}

		if wtId != lastWorktree {
			// Worktree switched — clear caches so we always emit fresh data.
			cachedPr = ""
			cachedCi = ""
			cachedPrsList = ""
			lastWorktree = wtId
		}

		repoPath, branch, err := a.resolveRepoBranch(wtId)
		if err != nil {
			log.Warn("app/GitHubPoller: workspace gone, clearing watch", "worktreeId", wtId)
			a.watchedMu.Lock()
			a.watchedWorktree = ""
			a.watchedMu.Unlock()
			lastWorktree = ""
			return 5 * time.Second
		}

		// Detect external branch changes (e.g. git checkout via CLI)
		q := db.New(a.DB.Reader)
		if ws, dbErr := q.GetWorkspace(a.ctx, wtId); dbErr == nil && ws.Branch != branch {
			log.Info("app/GitHubPoller: branch changed externally", "old", ws.Branch, "new", branch)
			wq := db.New(a.DB.Writer)
			_ = wq.UpdateWorkspace(a.ctx, db.UpdateWorkspaceParams{
				ID: wtId, Type: ws.Type, Name: ws.Name, Branch: branch,
				WorktreePath: ws.WorktreePath, PortBase: ws.PortBase,
				SectionID: ws.SectionID, BaseBranch: ws.BaseBranch,
				TabOrder: ws.TabOrder, IsActive: ws.IsActive, TicketUrl: ws.TicketUrl,
			})
			wailsRuntime.EventsEmit(a.ctx, EventWorktreeUpdated)
			cachedPr = ""
			cachedCi = ""
			cachedPrsList = ""
		}

		baseBranch := resolveBaseBranch(a, wtId, repoPath)
		onDefault := branch == baseBranch

		if onDefault {
			prs, err := git.ListOpenPrsForBase(a.ctx, repoPath, baseBranch, 20)
			if err != nil {
				log.Error("app/GitHubPoller: ListOpenPrsForBase failed", "err", err)
				return 60 * time.Second
			}
			if prs == nil {
				prs = []git.PrStatus{}
			}
			j := marshalOrEmpty(prs)
			if j != cachedPrsList {
				cachedPrsList = j
				wailsRuntime.EventsEmit(a.ctx, EventPrsListUpdated, prs)
				log.Info("app/GitHubPoller: prs:list-updated emitted", "count", len(prs))
			}
			return 30 * time.Second
		}

		// Feature branch: poll PR status and CI runs.
		pr, _ := git.GetPrStatus(a.ctx, repoPath, branch)
		prJ := marshalOrEmpty(pr)
		if prJ != cachedPr {
			cachedPr = prJ
			wailsRuntime.EventsEmit(a.ctx, EventPrUpdated, pr)
			log.Info("app/GitHubPoller: pr:updated emitted", "hasPR", pr != nil)
		}

		runs, _ := git.GetCiRuns(a.ctx, repoPath, branch)
		if runs == nil {
			runs = []git.CiRun{}
		}
		ciJ := marshalOrEmpty(runs)
		if ciJ != cachedCi {
			cachedCi = ciJ
			wailsRuntime.EventsEmit(a.ctx, EventCiUpdated, runs)
			log.Info("app/GitHubPoller: ci:updated emitted", "count", len(runs))
		}

		// Shorten interval while any run is still in-progress.
		for _, r := range runs {
			if r.Conclusion == "" {
				return 10 * time.Second
			}
		}
		return 30 * time.Second
	}

	interval := poll()
	timer := time.NewTimer(interval)
	defer timer.Stop()

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-a.prRefresh:
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			interval = poll()
			timer.Reset(interval)
		case <-a.branchRefresh:
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			interval = poll()
			timer.Reset(interval)
		case <-timer.C:
			interval = poll()
			timer.Reset(interval)
		}
	}
}

// startBackgroundFetch periodically fetches origin for all known projects.
// It runs until the app context is cancelled.
func (a *App) startBackgroundFetch() {
	// Initial fetch so ahead/behind counts are accurate from startup.
	if err := a.FetchAllProjects(); err != nil {
		log.Error("app/backgroundFetch: initial fetch failed", "err", err)
	}
	wailsRuntime.EventsEmit(a.ctx, EventGitStatus)

	ticker := time.NewTicker(3 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			if err := a.FetchAllProjects(); err != nil {
				log.Error("app/backgroundFetch: periodic fetch failed", "err", err)
			}
			wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
		}
	}
}
