// Wails bindings for native OS dialogs.
// Author: Subash Karki
package app

import (
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// BrowseDirectory opens a native folder picker dialog and returns the selected path.
// Returns empty string if cancelled.
func (a *App) BrowseDirectory(title string) string {
	dir, err := wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: title,
	})
	if err != nil {
		return ""
	}
	return dir
}
