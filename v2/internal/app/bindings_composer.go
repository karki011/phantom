// Wails bindings for the Composer (agentic edit) pane.
// Author: Subash Karki
package app

import (
	"encoding/base64"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/composer"
)

// ComposerSend starts a new turn on the given pane. Returns the new turn ID.
// Streaming events flow on "composer:event"; edit cards on "composer:edit-pending".
//
// noContext, when true, runs the turn with --setting-sources "" inside a
// fresh temp directory so the agent has zero workspace awareness. Used by
// the "No project context" toggle in the Composer status strip.
func (a *App) ComposerSend(paneID, prompt, cwd, model string, mentions []composer.Mention, noContext bool) string {
	if a.Composer == nil {
		slog.Warn("ComposerSend: composer service not initialised")
		return ""
	}
	id, err := a.Composer.Send(a.ctx, composer.SendArgs{
		PaneID:    paneID,
		Prompt:    prompt,
		CWD:       cwd,
		Model:     model,
		Mentions:  mentions,
		NoContext: noContext,
	})
	if err != nil {
		slog.Error("ComposerSend failed", "pane", paneID, "err", err)
		return ""
	}
	return id
}

// ComposerCancel stops the active run on a pane (no-op if nothing running).
func (a *App) ComposerCancel(paneID string) {
	if a.Composer == nil {
		return
	}
	a.Composer.Cancel(paneID)
}

// ComposerNewConversation drops the cached session for the pane so the next
// Send starts a fresh claude conversation. Cancels any in-flight run first.
func (a *App) ComposerNewConversation(paneID string) {
	if a.Composer == nil {
		return
	}
	a.Composer.NewConversation(paneID)
}

// ComposerDecideEdit applies the user's accept/discard choice to a pending
// edit card. accept=true keeps the on-disk change; accept=false reverts via
// `git checkout -- <path>` (or unlink if the file was newly created).
func (a *App) ComposerDecideEdit(editID string, accept bool) error {
	if a.Composer == nil {
		return nil
	}
	if err := a.Composer.DecideEdit(a.ctx, editID, accept); err != nil {
		slog.Error("ComposerDecideEdit failed", "edit", editID, "err", err)
		return err
	}
	return nil
}

// WriteTempFileBase64 decodes the given base64 payload and writes it to
// `path` (must be inside /tmp). Used by the Composer pane to land
// clipboard-pasted images on disk so they can be attached as @file mentions.
// Restricted to /tmp to avoid arbitrary filesystem writes.
func (a *App) WriteTempFileBase64(path, b64 string) error {
	clean := filepath.Clean(path)
	if !strings.HasPrefix(clean, "/tmp/") {
		return fmt.Errorf("WriteTempFileBase64: path must be under /tmp")
	}
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return fmt.Errorf("WriteTempFileBase64: decode: %w", err)
	}
	if err := os.WriteFile(clean, data, 0o600); err != nil {
		return fmt.Errorf("WriteTempFileBase64: write: %w", err)
	}
	return nil
}

// ComposerHistory returns all turns + edits for a pane in chronological
// order. Used on pane mount to rehydrate the conversation feed.
func (a *App) ComposerHistory(paneID string) []composer.HistoryTurn {
	if a.Composer == nil {
		return []composer.HistoryTurn{}
	}
	out, err := a.Composer.History(a.ctx, paneID)
	if err != nil {
		slog.Error("ComposerHistory failed", "pane", paneID, "err", err)
		return []composer.HistoryTurn{}
	}
	if out == nil {
		return []composer.HistoryTurn{}
	}
	return out
}

// ComposerListSessions returns the 50 most recently active claude sessions,
// ordered by last activity (newest first). Drives the "Past Sessions"
// sidebar so users can resume any prior conversation in a fresh pane.
func (a *App) ComposerListSessions() []composer.SessionSummary {
	if a.Composer == nil {
		return []composer.SessionSummary{}
	}
	out, err := a.Composer.ListSessions(a.ctx)
	if err != nil {
		slog.Error("ComposerListSessions failed", "err", err)
		return []composer.SessionSummary{}
	}
	if out == nil {
		return []composer.SessionSummary{}
	}
	return out
}

// ComposerHistoryBySession returns every turn (with edits) that belongs to
// the given claude session_id. Used to rehydrate a freshly-opened pane that
// resumed an existing session — the pane was never the original owner of
// those turns, so the pane-id-keyed History wouldn't return them.
func (a *App) ComposerHistoryBySession(sessionID string) []composer.HistoryTurn {
	if a.Composer == nil {
		return []composer.HistoryTurn{}
	}
	out, err := a.Composer.HistoryBySession(a.ctx, sessionID)
	if err != nil {
		slog.Error("ComposerHistoryBySession failed", "session", sessionID, "err", err)
		return []composer.HistoryTurn{}
	}
	if out == nil {
		return []composer.HistoryTurn{}
	}
	return out
}

// ComposerResumeSession binds a pane to an existing claude session so the
// pane's next Send re-attaches via `--resume <sessionID>` instead of
// allocating a fresh session.
func (a *App) ComposerResumeSession(paneID, sessionID string) {
	if a.Composer == nil {
		return
	}
	a.Composer.ResumeSession(paneID, sessionID)
}

// ComposerDeleteSession hard-deletes a past session — every turn + edit row
// is removed and any pane currently bound to it is detached (in-flight runs
// cancelled). Returns nil on missing session; treat "delete nothing" as
// success so the sidebar can optimistically remove the row.
func (a *App) ComposerDeleteSession(sessionID string) error {
	if a.Composer == nil {
		return nil
	}
	if err := a.Composer.DeleteSession(a.ctx, sessionID); err != nil {
		slog.Error("ComposerDeleteSession failed", "session", sessionID, "err", err)
		return err
	}
	return nil
}

// ComposerListPending returns all pending edit cards for a pane (used on
// pane mount to repopulate cards after a refresh / app restart).
func (a *App) ComposerListPending(paneID string) []composer.Edit {
	if a.Composer == nil {
		return []composer.Edit{}
	}
	out, err := a.Composer.ListPending(a.ctx, paneID)
	if err != nil {
		slog.Error("ComposerListPending failed", "pane", paneID, "err", err)
		return []composer.Edit{}
	}
	if out == nil {
		return []composer.Edit{}
	}
	return out
}
