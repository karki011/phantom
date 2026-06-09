//go:build ghostty

// Author: Subash Karki
//
// Runtime config + ghostty_app_t lifecycle. The callbacks below are the
// minimum required by libghostty to call back into us. Real implementations
// will route events to Wails (for clipboard) and to per-surface handlers
// (for action_cb dispatch). For now they're safe no-op stubs that satisfy
// the contract without crashing.
package ghostty

/*
#include <stdlib.h>
#include "ghostty.h"

// C callback shims declared in cgo_callbacks.go (via //export).
// We forward-declare them here so we can take their address from C.
extern void phantomGhosttyWakeupCB(void *userdata);
extern bool phantomGhosttyActionCB(ghostty_app_t app, ghostty_target_s target, ghostty_action_s action);
extern bool phantomGhosttyReadClipboardCB(void *userdata, ghostty_clipboard_e cb, void *state);
extern void phantomGhosttyConfirmReadClipboardCB(void *userdata, const char *prompt, void *state, ghostty_clipboard_request_e req);
extern void phantomGhosttyWriteClipboardCB(void *userdata, ghostty_clipboard_e cb, const ghostty_clipboard_content_s *content, size_t count, bool confirm);
extern void phantomGhosttyCloseSurfaceCB(void *userdata, bool process_alive);

// Helper to build the runtime config struct in C (cleaner than Go cgo for nested structs).
static ghostty_runtime_config_s phantom_runtime_config(void *userdata) {
    ghostty_runtime_config_s cfg = {0};
    cfg.userdata = userdata;
    cfg.supports_selection_clipboard = false;
    cfg.wakeup_cb = phantomGhosttyWakeupCB;
    cfg.action_cb = phantomGhosttyActionCB;
    cfg.read_clipboard_cb = phantomGhosttyReadClipboardCB;
    cfg.confirm_read_clipboard_cb = phantomGhosttyConfirmReadClipboardCB;
    cfg.write_clipboard_cb = phantomGhosttyWriteClipboardCB;
    cfg.close_surface_cb = phantomGhosttyCloseSurfaceCB;
    return cfg;
}

// Main-thread dispatch wrappers (defined in phantom_main_dispatch.m).
extern ghostty_config_t phantom_config_new_main(void);
extern void phantom_config_load_default_files_main(ghostty_config_t);
extern void phantom_config_load_file_main(ghostty_config_t, const char*);
extern void phantom_config_finalize_main(ghostty_config_t);
extern void phantom_config_free_main(ghostty_config_t);
extern ghostty_app_t phantom_app_new_main(const ghostty_runtime_config_s*, ghostty_config_t);
extern void phantom_app_free_main(ghostty_app_t);
extern void phantom_app_tick_main(ghostty_app_t);
extern void phantom_app_set_focus_main(ghostty_app_t, bool);
extern void phantom_app_set_color_scheme_main(ghostty_app_t, ghostty_color_scheme_e);

// Preamble helper — builds runtime config from Go pointer (relaxed CGo
// pointer rules for preamble functions) then dispatches to main thread.
static ghostty_app_t phantom_app_new(void *userdata, ghostty_config_t config) {
    ghostty_runtime_config_s rt = phantom_runtime_config(userdata);
    return phantom_app_new_main(&rt, config);
}
*/
import "C"

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
	"unsafe"
)

// phantomGhosttyConfig contains the libghostty config overrides Phantom
// always applies on top of user defaults. Currently focused on idle-CPU
// minimization (drop the 2Hz cursor blink which would otherwise wake the
// Metal renderer twice per second per surface).
const phantomGhosttyConfig = `# Phantom-managed defaults — do not edit, regenerated on app start.
cursor-style-blink = false
scrollback-limit = 10000
`

// writePhantomGhosttyConfig drops phantomGhosttyConfig into a stable path
// under the user's home and returns the path. Returns "" on any IO error;
// callers should treat that as "skip the override" rather than fatal.
func writePhantomGhosttyConfig() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	dir := filepath.Join(home, ".phantom-os")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return ""
	}
	path := filepath.Join(dir, "ghostty.config")
	if err := os.WriteFile(path, []byte(phantomGhosttyConfig), 0o644); err != nil {
		return ""
	}
	return path
}

// App wraps a ghostty_app_t. Use NewApp to construct, Shutdown (or Free) to
// release.
//
// Teardown synchronization (the 0.1.65/0.1.66 native-terminal crash class):
//   - tickMu serializes the C-side ghostty_app_tick (which renders every live
//     surface) against any ghostty_surface_free. A surface must never be freed
//     while a tick is mid-render of it, or libghostty dereferences a dangling
//     ghostty_surface_t. Both App.Tick and Surface.Free take tickMu.
//   - surfaces is the render set; a surface is removed from it (and from
//     focusedSurface) before its handle is freed.
//   - stopTick/tickDone/stopOnce drive a clean stop+join of the tick loop so no
//     tick can begin after Shutdown starts freeing surfaces.
type App struct {
	mu     sync.Mutex
	handle C.ghostty_app_t
	config C.ghostty_config_t
	closed bool

	// surfaces is the set of live surfaces this app is rendering. Guarded by mu.
	surfaces map[*Surface]struct{}

	// tickMu serializes App.Tick (C render of all surfaces) against per-surface
	// frees. Distinct from mu so a free can hold it across the C call without
	// blocking cheap handle reads.
	tickMu sync.Mutex

	// Tick-loop lifecycle. stopTick is closed to signal the loop to exit;
	// tickDone is closed by the loop goroutine once it has fully returned.
	// stopOnce makes Shutdown idempotent and guards stopTick close.
	stopTick chan struct{}
	tickDone chan struct{}
	stopOnce sync.Once
}

// trackSurface adds s to the app's render set.
func (a *App) trackSurface(s *Surface) {
	a.mu.Lock()
	if a.surfaces == nil {
		a.surfaces = make(map[*Surface]struct{})
	}
	a.surfaces[s] = struct{}{}
	a.mu.Unlock()
}

// untrackSurface removes s from the app's render set.
func (a *App) untrackSurface(s *Surface) {
	a.mu.Lock()
	delete(a.surfaces, s)
	a.mu.Unlock()
}

// NewApp creates a new ghostty app instance with default config and stub
// callbacks. Returns ErrNotAvailable when libghostty isn't usable.
//
// The Go *App holds both the ghostty_app_t and the ghostty_config_t handles
// because ghostty_app_new takes ownership of config (caller must NOT free it
// separately — freeing the app frees the config).
func NewApp() (*App, error) {
	if !Available() {
		return nil, ErrNotAvailable
	}
	if err := Init(); err != nil {
		return nil, err
	}

	cfg := C.phantom_config_new_main()
	if cfg == nil {
		return nil, errors.New("ghostty_config_new returned nil")
	}
	C.phantom_config_load_default_files_main(cfg)
	if path := writePhantomGhosttyConfig(); path != "" {
		cpath := C.CString(path)
		C.phantom_config_load_file_main(cfg, cpath)
		C.free(unsafe.Pointer(cpath))
	}
	C.phantom_config_finalize_main(cfg)

	a := &App{config: cfg}
	// userdata is intentionally nil: libghostty retains this pointer for the
	// app's lifetime and hands it to every callback, but our //export callbacks
	// route via package globals (wakeupCh, focusedSurface) and never read it.
	// Passing the live *App would hand a Go pointer that now embeds Go pointers
	// (the surfaces map / tick channels) to C — a cgo-pointer-rule violation
	// that cgocheck would panic on.
	a.handle = C.phantom_app_new(nil, cfg)
	if a.handle == nil {
		C.phantom_config_free_main(cfg)
		return nil, errors.New("ghostty_app_new returned nil")
	}
	return a, nil
}

// Tick advances the app's internal event loop. Call regularly (~60Hz)
// when integrated; once per test for smoke checks.
//
// tickMu is held across the C tick so a surface free (which also takes tickMu)
// can never run while libghostty is mid-render of that surface. The closed/
// handle check stays under mu (consistent with the other accessors).
func (a *App) Tick() {
	a.tickMu.Lock()
	defer a.tickMu.Unlock()

	a.mu.Lock()
	handle := a.handle
	closed := a.closed
	a.mu.Unlock()
	if closed || handle == nil {
		return
	}
	C.phantom_app_tick_main(handle)
}

// SetFocus toggles app focus.
func (a *App) SetFocus(focused bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.closed || a.handle == nil {
		return
	}
	C.phantom_app_set_focus_main(a.handle, C.bool(focused))
}

// Shutdown is the single, idempotent teardown entry point. It is safe to call
// at any point in app shutdown and does NOT depend on any external context
// cancellation ordering. In order it:
//
//  1. Signals the tick loop to stop and JOINS it (waits for the loop goroutine
//     to fully exit) so no tick can begin during the frees below.
//  2. Frees every live surface — each Surface.Free clears focusedSurface and
//     serializes against the (now-stopped) tick via tickMu.
//  3. Frees the ghostty_app_t itself.
//
// After Shutdown returns, no goroutine in this package holds a live
// ghostty_surface_t or ghostty_app_t.
func (a *App) Shutdown() {
	a.stopTickLoop()
	a.waitTick()

	a.mu.Lock()
	surfaces := a.surfaces
	a.surfaces = nil
	a.mu.Unlock()

	for s := range surfaces {
		s.Free()
	}

	a.Free()
}

// stopTickLoop signals the tick loop goroutine to exit. Idempotent: stopOnce
// guards the channel close so multiple Shutdown calls are safe.
func (a *App) stopTickLoop() {
	a.stopOnce.Do(func() {
		a.mu.Lock()
		stop := a.stopTick
		a.mu.Unlock()
		if stop != nil {
			close(stop)
		}
	})
}

// waitTick blocks until the tick loop goroutine has fully returned. Returns
// immediately if no loop was ever started.
func (a *App) waitTick() {
	a.mu.Lock()
	done := a.tickDone
	a.mu.Unlock()
	if done != nil {
		<-done
	}
}

// Free releases the ghostty_app_t and its config. Prefer Shutdown for full
// teardown; Free alone does not stop the tick loop or free surfaces. Kept for
// the smoke test and as the final step of Shutdown.
func (a *App) Free() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.closed {
		return
	}
	a.closed = true
	if a.handle != nil {
		C.phantom_app_free_main(a.handle)
		a.handle = nil
	}
	// config is owned by app after ghostty_app_new — don't free separately
	a.config = nil
}

// SetColorScheme tells libghostty to use light or dark colors. Phantom is
// dark-only for now but this prepares for future theme switching.
func (a *App) SetColorScheme(dark bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.closed || a.handle == nil {
		return
	}
	scheme := C.ghostty_color_scheme_e(C.GHOSTTY_COLOR_SCHEME_LIGHT)
	if dark {
		scheme = C.ghostty_color_scheme_e(C.GHOSTTY_COLOR_SCHEME_DARK)
	}
	C.phantom_app_set_color_scheme_main(a.handle, scheme)
}

// StartTickLoop runs the ~60Hz event loop that drives libghostty rendering
// and IO. It wakes immediately when libghostty signals via the wakeup
// callback, and ticks at least once every ~16ms. The loop exits when ctx is
// cancelled OR when App.Shutdown closes the app's stopTick channel — whichever
// comes first. Shutdown joins this goroutine via tickDone before freeing any
// surface, so a Shutdown that races app-context cancellation is still safe.
func StartTickLoop(app *App, ctx context.Context) {
	initWakeup()

	stop := make(chan struct{})
	done := make(chan struct{})
	app.mu.Lock()
	app.stopTick = stop
	app.tickDone = done
	app.mu.Unlock()

	go func() {
		defer close(done)
		ticker := time.NewTicker(16 * time.Millisecond) // ~60Hz
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-stop:
				return
			case <-wakeupCh:
				app.Tick()
			case <-ticker.C:
				app.Tick()
			}
		}
	}()
}
