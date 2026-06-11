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
extern double phantom_window_content_height(void *window);
extern void phantom_add_native_subview(void *window, void *child);
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
// the one whose content view contains a WKWebView. Strict match only — no
// fallback window. Returns a transient error if no such window exists yet
// (e.g. before DomReady); callers may retry.
//
// CONTRACT (canonical — frontend retry depends on these exact strings):
//   - transient:  error message CONTAINS "window not ready" → NativeTerminalPane retries (250ms*attempt, max 8)
//   - permanent:  "native terminal disabled", "libghostty not available" → no retry, error state
// Do not rename these substrings without updating NativeTerminalPane.tsx and core/bindings/native-terminal.ts.
func FindHostWindow() (*HostWindow, error) {
	w := C.phantom_find_main_window()
	if w == nil {
		return nil, errors.New("ghostty: window not ready (no Wails NSWindow hosting a WKWebView yet)")
	}
	return &HostWindow{window: w}, nil
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
// view. The attach is dispatched onto the main queue so this is safe to
// call from any goroutine. We pass the WINDOW, never a captured
// contentView — the contentView is re-resolved inside the main-queue
// block so a contentView freed between call and dispatch is never
// messaged.
func (h *HostWindow) AttachSubview(view uintptr) {
	if h == nil || h.window == nil || view == 0 {
		return
	}
	C.phantom_add_native_subview(h.window, unsafe.Pointer(view))
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
