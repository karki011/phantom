// Wails bindings for user preference operations.
// Author: Subash Karki
package app

import (
	"context"
	"database/sql"
	"log"
	"os/exec"
	"strings"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/db"
)

func (a *App) GetPreference(key string) string {
	q := db.New(a.DB.Reader)
	value, err := q.GetPreference(a.ctx, key)
	if err != nil {
		if err != sql.ErrNoRows {
			log.Printf("app/bindings_prefs: GetPreference(%s) error: %v", key, err)
		}
		return ""
	}
	return value
}

func (a *App) SetPreference(key, value string) error {
	q := db.New(a.DB.Writer)
	return q.SetPreference(a.ctx, db.SetPreferenceParams{
		Key:       key,
		Value:     value,
		UpdatedAt: time.Now().Unix(),
	})
}

// GetGitUserName returns the global git user name, or empty string if not configured.
func (a *App) GetGitUserName() string {
	ctx, cancel := context.WithTimeout(a.ctx, 3*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "git", "config", "--global", "user.name").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
