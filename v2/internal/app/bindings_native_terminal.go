//go:build darwin && ghostty

// Author: Subash Karki
//
// Wails-exposed methods for the libghostty-backed native terminal. The native
// (Metal/libghostty) terminal is OFF by default as of 0.1.67 — it caused
// crash/hang regressions in 0.1.65 and 0.1.66, so the app falls back to the
// proven web/PTY terminal, which is now the default. The frontend pane (when
// opted in) creates a Surface, parents its PhantomTerminalView as a sibling of
// the WKWebView, and drives placement from a ResizeObserver. Opt back in for
// testing via env PHANTOM_NATIVE_TERMINAL=1 (or true) or the runtime toggle
// (SetNativeTerminalEnabled(true)).
package app

import (
	"errors"
	"os"
	"strings"
	"sync/atomic"

	"github.com/charmbracelet/log"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/subashkarki/phantom-os-v2/internal/terminal/ghostty"
)

// nativeTerminalEnabledFlag forces the libghostty path ON when set. The
// native (Metal/libghostty) terminal is OFF by default as of 0.1.67 — it
// caused crash/hang regressions in 0.1.65 and 0.1.66 (see branch
// fix/native-terminal-multi-session-crash). The app falls back to the proven
// web/PTY terminal. Opt back in for testing via PHANTOM_NATIVE_TERMINAL=1
// (or true), or the runtime toggle SetNativeTerminalEnabled(true).
var nativeTerminalEnabledFlag atomic.Bool

// NativeTerminalIsEnabled returns true ONLY when the native terminal has been
// explicitly opted in. Default OFF.
func (a *App) NativeTerminalIsEnabled() bool {
	if nativeTerminalEnabledFlag.Load() {
		return true
	}
	if v := strings.TrimSpace(os.Getenv("PHANTOM_NATIVE_TERMINAL")); v == "1" || strings.EqualFold(v, "true") {
		return true
	}
	return false
}

// SetNativeTerminalEnabled toggles the in-memory opt-in flag at runtime.
func (a *App) SetNativeTerminalEnabled(on bool) {
	nativeTerminalEnabledFlag.Store(on)
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

	// Lazy-init the process-wide ghostty app exactly once. The check-then-act
	// on a.ghosttyApp is NOT atomic (the expensive NewApp runs with nativeMu
	// released to avoid a main-thread-callback deadlock), so two concurrent
	// creates would each see nil and each call ghostty_app_new — but libghostty
	// is one ghostty_app_t per process, which crashes. ghosttyInitMu serializes
	// the init and a re-check under it collapses the race to a single NewApp.
	// Heavy work (dispatch_sync to main thread) still runs WITHOUT nativeMu.
	if gapp == nil {
		a.ghosttyInitMu.Lock()

		a.nativeMu.Lock()
		gapp = a.ghosttyApp
		a.nativeMu.Unlock()

		if gapp == nil {
			// Register the event dispatcher before creating the app so callbacks
			// can emit events from the very first tick.
			ghostty.SetEventDispatcher(func(event string, data interface{}) {
				wailsRuntime.EventsEmit(a.ctx, event, data)
			})

			newApp, err := ghostty.NewApp()
			if err != nil {
				a.ghosttyInitMu.Unlock()
				return "", err
			}

			// Dark theme (Phantom is always dark for now).
			newApp.SetColorScheme(true)

			// Start the ~60Hz tick loop that drives rendering + IO.
			ghostty.StartTickLoop(newApp, a.ctx)

			a.nativeMu.Lock()
			a.ghosttyApp = newApp
			a.nativeMu.Unlock()

			gapp = newApp
		}

		a.ghosttyInitMu.Unlock()
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
	ghostty.SetFocusedSurface(surf)

	// Re-acquire lock to store results. a.ghosttyApp is already persisted by
	// the init block above (under ghosttyInitMu), so only the host + map entry
	// are stored here.
	a.nativeMu.Lock()
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
	ghostty.SetFocusedSurface(t.surface)
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

	// Clean PTY/NSView teardown per surface. Do NOT Free() surfaces here —
	// gapp.Shutdown() owns surface destruction (it joins the tick loop first,
	// then frees all tracked surfaces under its render mutex). Freeing here
	// would double-free / race the tick loop (v0.1.65 shutdown crash).
	for _, t := range terms {
		if t.surface != nil {
			t.surface.RequestClose()
		}
		if t.view != 0 {
			ghostty.DetachSubview(t.view)
		}
	}
	if gapp != nil {
		gapp.Shutdown()
	}
}
