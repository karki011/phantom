// Author: Subash Karki
//
// Thin Go wrappers around the NSWindow helpers in native_window.m.
// Only used by cmd/phantom-libghostty-demo — production Phantom hosts
// the surface inside Wails' NSWindow.
package ghostty

/*
#include <stdlib.h>

extern void  phantom_app_init(void);
extern void *phantom_window_new(double width, double height, const char *title);
extern void  phantom_window_set_content_view(void *window, void *view);
extern void  phantom_window_show(void *window);
extern void  phantom_run_event_loop(void);
extern void  phantom_stop_event_loop(void);
*/
import "C"

import (
	"unsafe"
)

// Window wraps an NSWindow* used by the standalone demo binary.
type Window struct {
	handle unsafe.Pointer
}

// InitNSApp must be called once on the main OS thread before creating
// any window or running the event loop.
func InitNSApp() {
	C.phantom_app_init()
}

// NewWindow creates an NSWindow centered on screen with the given size and title.
func NewWindow(width, height float64, title string) *Window {
	ctitle := C.CString(title)
	defer C.free(unsafe.Pointer(ctitle))
	h := C.phantom_window_new(C.double(width), C.double(height), ctitle)
	if h == nil {
		return nil
	}
	return &Window{handle: h}
}

// SetContentView installs the Surface's NSView as the window's content view.
// The view is resized to the content rect and given autoresizing masks.
func (w *Window) SetContentView(view uintptr) {
	if w == nil || w.handle == nil || view == 0 {
		return
	}
	C.phantom_window_set_content_view(w.handle, unsafe.Pointer(view))
}

// Show makes the window key and brings the app to the foreground.
func (w *Window) Show() {
	if w == nil || w.handle == nil {
		return
	}
	C.phantom_window_show(w.handle)
}

// RunEventLoop calls [NSApp run] and blocks until StopEventLoop is invoked
// or the user quits the app. Must be called on the main OS thread.
func RunEventLoop() {
	C.phantom_run_event_loop()
}

// StopEventLoop posts a stop request to NSApp; the run loop returns shortly.
// Safe to call from any goroutine.
func StopEventLoop() {
	C.phantom_stop_event_loop()
}
