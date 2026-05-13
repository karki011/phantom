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

// Defined in native_macos.m
extern void *phantom_terminal_view_new(double width, double height);
extern void phantom_terminal_view_release(void *handle);
extern void phantom_terminal_view_set_frame(void *handle, double x, double y, double width, double height);
extern double phantom_terminal_view_scale(void *handle);

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
	if a == nil || a.handle == nil {
		return nil, errors.New("nil app")
	}
	if opts.Width <= 0 {
		opts.Width = 800
	}
	if opts.Height <= 0 {
		opts.Height = 600
	}

	viewPtr := C.phantom_terminal_view_new(C.double(opts.Width), C.double(opts.Height))
	if viewPtr == nil {
		return nil, errors.New("phantom_terminal_view_new returned nil")
	}

	scale := C.phantom_terminal_view_scale(viewPtr)

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
	handle := C.ghostty_surface_new(a.handle, &cfg)
	if handle == nil {
		C.phantom_terminal_view_release(viewPtr)
		return nil, errors.New("ghostty_surface_new returned nil")
	}

	return &Surface{
		app:    a,
		view:   viewPtr,
		handle: handle,
	}, nil
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
	C.phantom_terminal_view_set_frame(s.view, C.double(x), C.double(y), C.double(width), C.double(height))
}

// Free releases the ghostty_surface_t and the native NSView.
func (s *Surface) Free() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	if s.handle != nil {
		C.ghostty_surface_free(s.handle)
		s.handle = nil
	}
	if s.view != nil {
		C.phantom_terminal_view_release(s.view)
		s.view = nil
	}
}
