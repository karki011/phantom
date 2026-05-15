//go:build ghostty

// Author: Subash Karki
//
// Wails host bridge — locates the Wails NSWindow from Go and attaches
// PhantomTerminalView NSViews as siblings of the WKWebView. Production
// path for routing libghostty surfaces into the running Wails app.
package ghostty

/*
#cgo darwin LDFLAGS: -framework Cocoa -framework WebKit

extern void *phantom_find_main_window(void);
extern void *phantom_window_content_view(void *window);
extern double phantom_window_content_height(void *window);
extern void phantom_add_native_subview(void *parent, void *child);
extern void phantom_remove_native_subview(void *child);
extern void phantom_make_first_responder(void *window, void *view);
*/
import "C"

import (
	"errors"
	"unsafe"
)

// HostWindow is an opaque handle to the Wails NSWindow.
type HostWindow struct {
	window unsafe.Pointer // NSWindow *
}

// FindHostWindow locates the Wails NSWindow by scanning NSApp.windows for
// the one whose content view contains a WKWebView. Returns an error if no
// such window exists (e.g. before DomReady).
func FindHostWindow() (*HostWindow, error) {
	w := C.phantom_find_main_window()
	if w == nil {
		return nil, errors.New("ghostty: no Wails NSWindow found (called before window opened?)")
	}
	return &HostWindow{window: w}, nil
}

// ContentView returns the NSWindow's contentView, which is the parent we
// attach terminal surfaces to.
func (h *HostWindow) ContentView() unsafe.Pointer {
	if h == nil || h.window == nil {
		return nil
	}
	return C.phantom_window_content_view(h.window)
}

// ContentHeight returns the current contentView height in points. Needed
// for translating web-coordinate Y values (top-down) into AppKit Y values
// (bottom-up).
func (h *HostWindow) ContentHeight() float64 {
	if h == nil || h.window == nil {
		return 0
	}
	return float64(C.phantom_window_content_height(h.window))
}

// AttachSubview adds an NSView as a subview of the host window's content
// view. The view is dispatched onto the main queue so this is safe to
// call from any goroutine.
func (h *HostWindow) AttachSubview(view uintptr) {
	if h == nil || h.window == nil || view == 0 {
		return
	}
	parent := C.phantom_window_content_view(h.window)
	if parent == nil {
		return
	}
	C.phantom_add_native_subview(parent, unsafe.Pointer(view))
}

// DetachSubview removes an NSView from its superview.
func DetachSubview(view uintptr) {
	if view == 0 {
		return
	}
	C.phantom_remove_native_subview(unsafe.Pointer(view))
}

// FocusSubview makes the given NSView the first responder of the host
// window. WKWebView claims focus on click; this re-routes keystrokes to
// the libghostty surface after attach and on user-driven activation.
func (h *HostWindow) FocusSubview(view uintptr) {
	if h == nil || h.window == nil || view == 0 {
		return
	}
	C.phantom_make_first_responder(h.window, unsafe.Pointer(view))
}
