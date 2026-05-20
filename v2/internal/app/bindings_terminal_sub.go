// Wails bindings for terminal subscription management.
// Author: Subash Karki
package app

import (
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"log/slog"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/terminal"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// SubscribeTerminal starts a Wails event bridge for the given session. PTY
// output is emitted as "terminal:{sessionId}:data" events with a base64-encoded
// payload. Calling this multiple times for the same session cancels the
// previous subscription first to avoid duplicate listeners.
func (a *App) SubscribeTerminal(sessionID string) {
	sess, ok := a.Terminal.Get(sessionID)
	if !ok {
		slog.Warn("SubscribeTerminal: session not found", "sessionID", sessionID)
		return
	}

	listenerID := "wails-" + sessionID
	ch := sess.Subscribe(listenerID)

	subCtx, cancel := context.WithCancel(a.ctx)

	// Cancel any existing subscription for this session before replacing it.
	a.terminalSubsMu.Lock()
	if prev, exists := a.terminalSubs[sessionID]; exists {
		prev()
	}
	a.terminalSubs[sessionID] = cancel
	a.terminalSubsMu.Unlock()

	eventName := fmt.Sprintf("terminal:%s:data", sessionID)

	// Batch PTY output with 2ms coalescing to reduce Wails event count by
	// 10-100x during high throughput (builds, log tailing) while adding at
	// most 2ms latency (imperceptible — human reaction time is 100ms+).
	const (
		batchInterval = 2 * time.Millisecond
		maxBatchSize  = 32768 // 32KB
	)

	go func() {
		defer sess.Unsubscribe(listenerID)

		var batch []byte
		timer := time.NewTimer(batchInterval)
		timer.Stop()
		timerRunning := false

		emit := func() {
			if len(batch) == 0 {
				return
			}
			wailsRuntime.EventsEmit(a.ctx, eventName,
				base64.StdEncoding.EncodeToString(batch))
			batch = batch[:0]
			timerRunning = false
		}

		for {
			select {
			case <-subCtx.Done():
				emit() // flush remaining
				return
			case data, ok := <-ch:
				if !ok {
					emit()
					return
				}
				batch = append(batch, data...)
				if len(batch) >= maxBatchSize {
					if timerRunning {
						timer.Stop()
					}
					emit()
				} else if !timerRunning {
					timer.Reset(batchInterval)
					timerRunning = true
				}
			case <-timer.C:
				timerRunning = false
				emit()
			}
		}
	}()
}

// UnsubscribeTerminal stops the Wails event bridge for the given session and
// removes the listener from the session's fan-out set.
func (a *App) UnsubscribeTerminal(sessionID string) {
	a.terminalSubsMu.Lock()
	cancel, exists := a.terminalSubs[sessionID]
	if exists {
		delete(a.terminalSubs, sessionID)
	}
	a.terminalSubsMu.Unlock()

	if exists {
		cancel()
	}
}

// ListTerminals returns metadata snapshots for all active terminal sessions.
func (a *App) ListTerminals() []terminal.SessionInfo {
	return a.Terminal.List()
}

// ListTerminalsForWorktree returns DB records for active terminals belonging
// to the given worktree.
func (a *App) ListTerminalsForWorktree(worktreeId string) ([]db.TerminalSession, error) {
	q := db.New(a.DB.Reader)
	return q.ListTerminalsByWorktree(a.ctx, sql.NullString{String: worktreeId, Valid: worktreeId != ""})
}
