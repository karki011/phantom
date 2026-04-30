// Phantom — Shell operation bindings (Finder, default app)
// Author: Subash Karki

package app

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/charmbracelet/log"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// RevealInFinder reveals the file/directory in macOS Finder (selects it).
func (a *App) RevealInFinder(path string) error {
	log.Info("app/RevealInFinder: called", "path", path)
	if _, err := os.Stat(path); err != nil {
		log.Error("app/RevealInFinder: path not found", "path", path, "err", err)
		return fmt.Errorf("path not found: %s", path)
	}
	cmd := exec.Command("open", "-R", path)
	if err := cmd.Run(); err != nil {
		log.Error("app/RevealInFinder: open -R failed", "path", path, "err", err)
		return fmt.Errorf("could not reveal in Finder: %w", err)
	}
	log.Info("app/RevealInFinder: success", "path", path)
	return nil
}

// OpenInFinder opens a directory in Finder.
func (a *App) OpenInFinder(path string) error {
	log.Info("app/OpenInFinder: called", "path", path)
	if _, err := os.Stat(path); err != nil {
		log.Error("app/OpenInFinder: path not found", "path", path, "err", err)
		return fmt.Errorf("path not found: %s", path)
	}
	cmd := exec.Command("open", path)
	if err := cmd.Run(); err != nil {
		log.Error("app/OpenInFinder: open failed", "path", path, "err", err)
		return fmt.Errorf("could not open in Finder: %w", err)
	}
	log.Info("app/OpenInFinder: success", "path", path)
	return nil
}

// OpenURL opens a URL in the user's default browser via Wails runtime.
func (a *App) OpenURL(url string) {
	log.Info("app/OpenURL: called", "url", url)
	wailsRuntime.BrowserOpenURL(a.ctx, url)
}

// OpenInDefaultApp opens a file with the default application.
func (a *App) OpenInDefaultApp(path string) error {
	log.Info("app/OpenInDefaultApp: called", "path", path)
	if _, err := os.Stat(path); err != nil {
		log.Error("app/OpenInDefaultApp: path not found", "path", path, "err", err)
		return fmt.Errorf("path not found: %s", path)
	}
	cmd := exec.Command("open", path)
	if err := cmd.Run(); err != nil {
		log.Error("app/OpenInDefaultApp: open failed", "path", path, "err", err)
		return fmt.Errorf("could not open file: %w", err)
	}
	log.Info("app/OpenInDefaultApp: success", "path", path)
	return nil
}
