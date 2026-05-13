//go:build darwin

// Author: Subash Karki
//
// Wails-exposed methods for the libghostty-backed native terminal. These
// are no-ops unless the feature flag is enabled (env PHANTOM_NATIVE_TERMINAL=1
// or preference key "ai.nativeTerminal"). When enabled the frontend pane
// creates a Surface, parents its PhantomTerminalView as a sibling of the
// WKWebView, and drives placement from a ResizeObserver.
package app

import (
	"errors"
	"os"
	"strings"
	"sync/atomic"

	"github.com/charmbracelet/log"

	"github.com/subashkarki/phantom-os-v2/internal/terminal/ghostty"
)

var nativeTerminalRuntimeFlag atomic.Bool

// NativeTerminalIsEnabled returns true when the libghostty pane is active.
func (a *App) NativeTerminalIsEnabled() bool {
	if nativeTerminalRuntimeFlag.Load() {
		return true
	}
	if v := strings.TrimSpace(os.Getenv("PHANTOM_NATIVE_TERMINAL")); v == "1" || strings.EqualFold(v, "true") {
		return true
	}
	return false
}

// SetNativeTerminalEnabled toggles the flag at runtime (frontend setting).
// Persisting to preferences is left to the existing prefs binding; this
// only flips the in-memory flag so newly-opened terminals route correctly.
func (a *App) SetNativeTerminalEnabled(on bool) {
	nativeTerminalRuntimeFlag.Store(on)
}

// NativeTerminalCreate opens a libghostty surface, parents the resulting
// PhantomTerminalView under the Wails NSWindow, and tracks it by paneID.
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

	a.nativeMu.Lock()
	defer a.nativeMu.Unlock()

	if a.nativeTerminals == nil {
		a.nativeTerminals = make(map[string]nativeTerminal)
	}
	if _, ok := a.nativeTerminals[paneID]; ok {
		// Idempotent — caller probably remounted.
		return paneID, nil
	}

	if a.ghosttyApp == nil {
		gapp, err := ghostty.NewApp()
		if err != nil {
			return "", err
		}
		a.ghosttyApp = gapp
	}
	if a.nativeHost == nil {
		host, err := ghostty.FindHostWindow()
		if err != nil {
			return "", err
		}
		a.nativeHost = host
	}

	surf, err := a.ghosttyApp.NewSurface(ghostty.SurfaceOptions{
		WorkingDirectory: cwd,
	})
	if err != nil {
		return "", err
	}

	view := surf.NSView()
	a.nativeHost.AttachSubview(view)
	a.nativeHost.FocusSubview(view)

	a.nativeTerminals[paneID] = nativeTerminal{surface: surf, view: view}
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
	if t.view != 0 {
		ghostty.DetachSubview(t.view)
	}
	if t.surface != nil {
		t.surface.Free()
	}
	log.Info("native terminal destroyed", "pane", paneID)
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
