// Author: Subash Karki

package app

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/branding"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// FactoryResetConfirmPhrase must be typed exactly in Settings to authorize erase.
const FactoryResetConfirmPhrase = "DELETE MY PHANTOM DATA"

// FactoryResetLocalData tears down the app, removes the SQLite database and
// other Phantom-owned files under ~/.phantom-os/, then quits the process.
// Provider YAML overrides in ~/.phantom-os/providers/ are intentionally kept.
func (a *App) FactoryResetLocalData(confirmation string) error {
	if confirmation != FactoryResetConfirmPhrase {
		return fmt.Errorf("confirmation phrase does not match")
	}

	a.shutdownOnce.Do(func() {
		a.doTeardown(false)
	})

	if err := removePhantomLocalState(); err != nil {
		log.Error("app: factory reset — remove local state", "err", err)
		return err
	}

	log.Info("app: factory reset complete — quitting")
	wailsRuntime.Quit(a.ctx)
	return nil
}

func removePhantomLocalState() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("home dir: %w", err)
	}
	root := filepath.Join(home, branding.ConfigDirName)

	dbPath, err := db.DefaultDBPath()
	if err != nil {
		return err
	}
	if err := db.RemoveDatabaseFiles(dbPath); err != nil {
		return err
	}

	// Stray legacy snapshot file from older installs (no longer used).
	_ = os.Remove(filepath.Join(root, "phantom.v1.db"))

	// Best-effort cleanup of auxiliary state (ignore individual errors).
	_ = os.Remove(filepath.Join(root, "terminal-snapshots.json"))
	_ = os.Remove(filepath.Join(root, "terminal-snapshots.json.tmp"))
	_ = os.RemoveAll(filepath.Join(root, "ai-engine"))
	_ = os.RemoveAll(filepath.Join(root, "journal"))
	_ = os.Remove(filepath.Join(root, "errors.log"))
	_ = os.RemoveAll(filepath.Join(root, "context"))
	_ = os.RemoveAll(filepath.Join(root, "wards"))

	return nil
}
