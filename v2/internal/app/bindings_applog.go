// Author: Subash Karki
package app

import "github.com/subashkarki/phantom-os-v2/internal/applog"

// GetRecentAppLogs returns the last log lines captured from backend logging (stdlib,
// charmbracelet/log, and slog). maxLines is clamped to [1, 500]; default 50.
func (a *App) GetRecentAppLogs(maxLines int) []string {
	if maxLines <= 0 {
		maxLines = 50
	}
	if maxLines > 500 {
		maxLines = 500
	}
	return applog.Snapshot(maxLines)
}
