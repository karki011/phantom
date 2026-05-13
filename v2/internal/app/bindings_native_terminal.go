//go:build darwin

// Author: Subash Karki
//
// Wails-exposed methods for the libghostty-backed native terminal. Native
// (Metal) terminal is the default on darwin; the frontend pane creates a
// Surface, parents its PhantomTerminalView as a sibling of the WKWebView,
// and drives placement from a ResizeObserver. Opt out via env
// PHANTOM_NATIVE_TERMINAL=0 or the runtime toggle (SetNativeTerminalEnabled(false)).
package app

import (
	"errors"
	"os"
	"strings"
	"sync/atomic"

	"github.com/charmbracelet/log"

	"github.com/subashkarki/phantom-os-v2/internal/terminal/ghostty"
)

// nativeTerminalDisabledFlag forces the libghostty path OFF when set —
// inverted vs the prior "enabled" flag because native is now the default.
var nativeTerminalDisabledFlag atomic.Bool

// NativeTerminalIsEnabled returns true when the libghostty pane is active.
// Default ON; only OFF when the runtime toggle is flipped or env
// PHANTOM_NATIVE_TERMINAL=0/false is set.
func (a *App) NativeTerminalIsEnabled() bool {
	if nativeTerminalDisabledFlag.Load() {
		return false
	}
	if v := strings.TrimSpace(os.Getenv("PHANTOM_NATIVE_TERMINAL")); v == "0" || strings.EqualFold(v, "false") {
		return false
	}
	return true
}

// SetNativeTerminalEnabled toggles the flag at runtime (frontend setting).
// Persisting to preferences is left to the existing prefs binding; this
// only flips the in-memory flag so newly-opened terminals route correctly.
func (a *App) SetNativeTerminalEnabled(on bool) {
	nativeTerminalDisabledFlag.Store(!on)
}

// NativeTerminalCreate opens a libghostty surface, parents the resulting
// PhantomTerminalView under the Wails NSWindow, and tracks it by paneID.
//
// The mutex is held only around map/field reads and writes. The heavy
// dispatch_sync calls (ghostty.NewApp, ghostty.FindHostWindow, NewSurface)
// run outside the lock to prevent a deadlock when a ghostty callback on the
// main thread tries to acquire nativeMu.
func (a *App) NativeTerminalCreate(paneID, worktreeID, cwd string) (string, error) {
	if paneID == "" {
		return "", errors.New("paneID required")
	}
	if !a.NativeTerminalIsEnabled() {
		return "", errors.New("native terminal disabled")
	}
	if !ghostty.Available() {
		return "", errors.New("libghostty not available on this build")
	}

	// Check for existing entry and snapshot current app/host — under lock,
	// but do NOT call into ghostty while holding it.
	a.nativeMu.Lock()
	if a.nativeTerminals == nil {
		a.nativeTerminals = make(map[string]nativeTerminal)
	}
	if _, ok := a.nativeTerminals[paneID]; ok {
		// Idempotent — caller probably remounted.
		a.nativeMu.Unlock()
		return paneID, nil
	}
	gapp := a.ghosttyApp
	host := a.nativeHost
	a.nativeMu.Unlock()

	// Heavy work (dispatch_sync to main thread) runs WITHOUT the mutex.
	if gapp == nil {
		var err error
		gapp, err = ghostty.NewApp()
		if err != nil {
			return "", err
		}
	}
	if host == nil {
		var err error
		host, err = ghostty.FindHostWindow()
		if err != nil {
			return "", err
		}
	}

	surf, err := gapp.NewSurface(ghostty.SurfaceOptions{
		WorkingDirectory: cwd,
	})
	if err != nil {
		return "", err
	}

	view := surf.NSView()
	host.AttachSubview(view)
	host.FocusSubview(view)

	// Re-acquire lock to store results.
	a.nativeMu.Lock()
	a.ghosttyApp = gapp
	a.nativeHost = host
	a.nativeTerminals[paneID] = nativeTerminal{surface: surf, view: view}
	a.nativeMu.Unlock()

	log.Info("native terminal created", "pane", paneID, "worktree", worktreeID, "cwd", cwd)
	return paneID, nil
}

// NativeTerminalFocus re-acquires keyboard focus for paneID's surface.
// Called by the frontend when the pane becomes active or on click.
func (a *App) NativeTerminalFocus(paneID string) {
	a.nativeMu.Lock()
	t, ok := a.nativeTerminals[paneID]
	host := a.nativeHost
	a.nativeMu.Unlock()
	if !ok || t.view == 0 || host == nil {
		return
	}
	host.FocusSubview(t.view)
}

// NativeTerminalSetPlacement repositions the NSView for paneID using
// web-coordinate bounds reported by the frontend ResizeObserver.
func (a *App) NativeTerminalSetPlacement(paneID string, x, y, width, height float64) {
	a.nativeMu.Lock()
	t, ok := a.nativeTerminals[paneID]
	host := a.nativeHost
	a.nativeMu.Unlock()
	if !ok || t.surface == nil || host == nil {
		return
	}
	t.surface.SetPlacement(host, x, y, width, height)
}

// NativeTerminalDestroy removes the NSView and frees the surface.
// Sends ghostty_surface_request_close first so the PTY flushes / shell
// exits cleanly before the surface tears down.
func (a *App) NativeTerminalDestroy(paneID string) {
	a.nativeMu.Lock()
	t, ok := a.nativeTerminals[paneID]
	if ok {
		delete(a.nativeTerminals, paneID)
	}
	a.nativeMu.Unlock()
	if !ok {
		return
	}
	if t.surface != nil {
		t.surface.RequestClose()
	}
	if t.view != 0 {
		ghostty.DetachSubview(t.view)
	}
	if t.surface != nil {
		t.surface.Free()
	}
	log.Info("native terminal destroyed", "pane", paneID)
}

// NativeTerminalSetOcclusion marks paneID's surface as visible (false) or
// occluded (true). Frontend calls this when a pane becomes inactive so
// libghostty drops to a low-power render state.
func (a *App) NativeTerminalSetOcclusion(paneID string, hidden bool) {
	a.nativeMu.Lock()
	t, ok := a.nativeTerminals[paneID]
	a.nativeMu.Unlock()
	if !ok || t.surface == nil {
		return
	}
	t.surface.SetOcclusion(hidden)
}

// shutdownNativeTerminals tears down all surfaces + the ghostty app.
// Called from doTeardown.
func (a *App) shutdownNativeTerminals() {
	a.nativeMu.Lock()
	terms := a.nativeTerminals
	a.nativeTerminals = nil
	gapp := a.ghosttyApp
	a.ghosttyApp = nil
	a.nativeHost = nil
	a.nativeMu.Unlock()

	for _, t := range terms {
		if t.surface != nil {
			t.surface.RequestClose()
		}
		if t.view != 0 {
			ghostty.DetachSubview(t.view)
		}
		if t.surface != nil {
			t.surface.Free()
		}
	}
	if gapp != nil {
		gapp.Free()
	}
}
