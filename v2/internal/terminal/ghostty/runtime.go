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

static ghostty_app_t phantom_app_new(void *userdata, ghostty_config_t config) {
    ghostty_runtime_config_s rt = phantom_runtime_config(userdata);
    return ghostty_app_new(&rt, config);
}
*/
import "C"

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"unsafe"
)

// phantomGhosttyConfig contains the libghostty config overrides Phantom
// always applies on top of user defaults. Currently focused on idle-CPU
// minimization (drop the 2Hz cursor blink which would otherwise wake the
// Metal renderer twice per second per surface).
const phantomGhosttyConfig = `# Phantom-managed defaults — do not edit, regenerated on app start.
cursor-style-blink = false
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

// App wraps a ghostty_app_t. Use NewApp to construct, Free to release.
type App struct {
	mu      sync.Mutex
	handle  C.ghostty_app_t
	config  C.ghostty_config_t
	closed  bool
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

	cfg := C.ghostty_config_new()
	if cfg == nil {
		return nil, errors.New("ghostty_config_new returned nil")
	}
	C.ghostty_config_load_default_files(cfg)
	// Layer Phantom-managed overrides last so they win over user defaults
	// for the keys we care about (idle-CPU tuning).
	if path := writePhantomGhosttyConfig(); path != "" {
		cpath := C.CString(path)
		C.ghostty_config_load_file(cfg, cpath)
		C.free(unsafe.Pointer(cpath))
	}
	C.ghostty_config_finalize(cfg)

	a := &App{config: cfg}
	a.handle = C.phantom_app_new(unsafe.Pointer(a), cfg)
	if a.handle == nil {
		C.ghostty_config_free(cfg)
		return nil, errors.New("ghostty_app_new returned nil")
	}
	return a, nil
}

// Tick advances the app's internal event loop. Call regularly (~60Hz)
// when integrated; once per test for smoke checks.
func (a *App) Tick() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.closed || a.handle == nil {
		return
	}
	C.ghostty_app_tick(a.handle)
}

// SetFocus toggles app focus.
func (a *App) SetFocus(focused bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.closed || a.handle == nil {
		return
	}
	C.ghostty_app_set_focus(a.handle, C.bool(focused))
}

// Free releases the ghostty_app_t and its config.
func (a *App) Free() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.closed {
		return
	}
	a.closed = true
	if a.handle != nil {
		C.ghostty_app_free(a.handle)
		a.handle = nil
	}
	// config is owned by app after ghostty_app_new — don't free separately
	a.config = nil
}
