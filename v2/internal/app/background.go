// Background goroutines for periodic git operations.
// Author: Subash Karki
package app

import (
	"time"

	"github.com/charmbracelet/log"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

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
