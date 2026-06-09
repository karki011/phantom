//go:build ghostty

// Author: Subash Karki
//
// Surface — wraps a ghostty_surface_t. A surface owns a per-terminal
// rendering pipeline and PTY. For Phantom each visible terminal tab gets
// its own Surface, anchored to a native NSView that lives as a sibling of
// the WKWebView so the Metal renderer draws directly to the GPU.
package ghostty

/*
#include <stdlib.h>
#include "ghostty.h"

// Main-thread dispatch wrappers (phantom_main_dispatch.m).
extern void *phantom_view_new_main(double w, double h);
extern void phantom_view_release_main(void *handle);
extern void phantom_view_set_frame_main(void *handle, double x, double y, double w, double h);
extern double phantom_view_scale_main(void *handle);
extern void phantom_view_attach_surface_main(void *handle, void *surface);
extern ghostty_surface_t phantom_surface_new_main(ghostty_app_t app, ghostty_surface_config_s *cfg);
extern void phantom_surface_free_main(ghostty_surface_t s);
extern void phantom_surface_request_close_main(ghostty_surface_t s);
extern void phantom_surface_set_occlusion_main(ghostty_surface_t s, bool hidden);

// Helper to build the surface config in C — easier than nested cgo for unions.
static ghostty_surface_config_s phantom_surface_config(void *nsview, double scale, const char *cwd, const char *cmd) {
    ghostty_surface_config_s cfg = ghostty_surface_config_new();
    cfg.platform_tag = GHOSTTY_PLATFORM_MACOS;
    cfg.platform.macos.nsview = nsview;
    cfg.scale_factor = scale;
    cfg.font_size = 0;        // 0 means inherit from config
    cfg.working_directory = cwd;
    cfg.command = cmd;
    cfg.wait_after_command = false;
    cfg.context = GHOSTTY_SURFACE_CONTEXT_WINDOW;
    return cfg;
}
*/
import "C"

import (
	"errors"
	"sync"
	"unsafe"
)

// Surface is one terminal instance with its own NSView + ghostty_surface_t.
type Surface struct {
	mu     sync.Mutex
	app    *App
	view   unsafe.Pointer // NSView * (PhantomTerminalView)
	handle C.ghostty_surface_t
	closed bool
}

// SurfaceOptions configure a new Surface.
type SurfaceOptions struct {
	Width            float64
	Height           float64
	WorkingDirectory string // empty = current
	Command          string // empty = default shell
}

// NewSurface creates a fresh terminal. The returned Surface owns a native
// NSView that the host must position inside its NSWindow. Use NSView() to
// retrieve the pointer.
func (a *App) NewSurface(opts SurfaceOptions) (*Surface, error) {
	if !Available() {
		return nil, ErrNotAvailable
	}
	if a == nil {
		return nil, errors.New("nil app")
	}

	// Copy handle under lock to guard against concurrent App.Free().
	a.mu.Lock()
	if a.closed || a.handle == nil {
		a.mu.Unlock()
		return nil, errors.New("app closed or nil handle")
	}
	appHandle := a.handle
	a.mu.Unlock()

	if opts.Width <= 0 {
		opts.Width = 800
	}
	if opts.Height <= 0 {
		opts.Height = 600
	}

	viewPtr := C.phantom_view_new_main(C.double(opts.Width), C.double(opts.Height))
	if viewPtr == nil {
		return nil, errors.New("phantom_terminal_view_new returned nil")
	}

	scale := C.phantom_view_scale_main(viewPtr)

	var cwd, cmd *C.char
	if opts.WorkingDirectory != "" {
		cwd = C.CString(opts.WorkingDirectory)
		defer C.free(unsafe.Pointer(cwd))
	}
	if opts.Command != "" {
		cmd = C.CString(opts.Command)
		defer C.free(unsafe.Pointer(cmd))
	}

	cfg := C.phantom_surface_config(viewPtr, scale, cwd, cmd)
	handle := C.phantom_surface_new_main(appHandle, &cfg)
	if handle == nil {
		C.phantom_view_release_main(viewPtr)
		return nil, errors.New("ghostty_surface_new returned nil")
	}

	C.phantom_view_attach_surface_main(viewPtr, unsafe.Pointer(handle))

	s := &Surface{
		app:    a,
		view:   viewPtr,
		handle: handle,
	}
	a.trackSurface(s)
	return s, nil
}

// NSView returns the Objective-C NSView pointer for this surface as an
// uintptr. The host must add this view to its NSWindow's contentView
// hierarchy and keep it correctly sized.
func (s *Surface) NSView() uintptr {
	s.mu.Lock()
	defer s.mu.Unlock()
	return uintptr(s.view)
}

// SetFrame updates the NSView's position and size in window coordinates.
// Safe to call from any goroutine; the actual layout happens on main.
func (s *Surface) SetFrame(x, y, width, height float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.view == nil {
		return
	}
	C.phantom_view_set_frame_main(s.view, C.double(x), C.double(y), C.double(width), C.double(height))
}

// RequestClose asks libghostty to flush + tear down the PTY for this
// surface. Call this before Free so the shell exits cleanly. No-op if
// already closed.
func (s *Surface) RequestClose() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.handle == nil {
		return
	}
	C.phantom_surface_request_close_main(s.handle)
}

// SetOcclusion tells libghostty whether this surface is currently visible.
// When occluded (true means hidden), the renderer drops to a low-power
// state — required to keep idle CPU near zero for backgrounded panes.
func (s *Surface) SetOcclusion(hidden bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.handle == nil {
		return
	}
	C.phantom_surface_set_occlusion_main(s.handle, C.bool(hidden))
}

// Free releases the ghostty_surface_t and the native NSView.
//
// Teardown ordering matters (the 0.1.65/0.1.66 crash class):
//  1. Take the app's tickMu so this free cannot overlap a ghostty_app_tick that
//     is mid-render of this surface — the tick renders the whole render set, so
//     freeing a surface handle from under it is a use-after-free.
//  2. Clear focusedSurface (if it points at this handle) so clipboard callbacks
//     can never dereference the about-to-be-freed handle.
//  3. Remove this surface from the app's render set so a subsequent tick won't
//     touch it.
//  4. Free the ghostty_surface_t, then release the NSView.
func (s *Surface) Free() {
	var app *App
	s.mu.Lock()
	app = s.app
	s.mu.Unlock()

	if app != nil {
		app.tickMu.Lock()
		defer app.tickMu.Unlock()
		app.untrackSurface(s)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	if s.handle != nil {
		clearFocusedSurfaceHandle(s.handle)
		C.phantom_surface_free_main(s.handle)
		s.handle = nil
	}
	if s.view != nil {
		C.phantom_view_release_main(s.view)
		s.view = nil
	}
}
