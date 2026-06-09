//go:build ghostty

// Author: Subash Karki
//
// CGo //export functions called by libghostty back into Go. These are the
// minimal contracts to keep libghostty happy.
//
// IMPORTANT: //export functions are visible to C as exact symbol names —
// libghostty references them by the names declared in runtime.go's C block.
package ghostty

/*
#include <stdlib.h>
#include <stdbool.h>
#include "ghostty.h"

// Clipboard helpers (phantom_clipboard.m)
extern char *phantom_pasteboard_read(void);
extern void phantom_pasteboard_write(const char *text);

// Main-thread dispatch wrapper (phantom_main_dispatch.m)
extern void phantom_surface_complete_clipboard_main(
    ghostty_surface_t surface, const char *data, void *state, bool confirmed);
*/
import "C"

import (
	"sync"
	"unsafe"

	"github.com/charmbracelet/log"
)

// ---------------------------------------------------------------------------
// Event dispatcher — the app layer registers a callback so //export functions
// in this package can emit Wails events without importing the app package.
// ---------------------------------------------------------------------------

var eventDispatcher func(event string, data interface{})

// SetEventDispatcher registers the function that routes native-terminal
// events to the frontend. Must be called before any surface is created.
func SetEventDispatcher(fn func(string, interface{})) {
	eventDispatcher = fn
}

func emitNativeTerminalEvent(event string, data interface{}) {
	if eventDispatcher != nil {
		eventDispatcher(event, data)
	}
}

// ---------------------------------------------------------------------------
// Wakeup channel — poked by libghostty when new work is available.
// ---------------------------------------------------------------------------

var wakeupCh chan struct{}

func initWakeup() {
	wakeupCh = make(chan struct{}, 1)
}

// WakeupCh returns the channel that the tick loop selects on. Callers must
// call initWakeup first (StartTickLoop does this automatically).
func WakeupCh() <-chan struct{} {
	return wakeupCh
}

var (
	focusedMu      sync.Mutex
	focusedSurface C.ghostty_surface_t
)

func SetFocusedSurface(s *Surface) {
	focusedMu.Lock()
	defer focusedMu.Unlock()
	if s == nil {
		focusedSurface = nil
		return
	}
	s.mu.Lock()
	focusedSurface = s.handle
	s.mu.Unlock()
}

// clearFocusedSurfaceHandle clears focusedSurface iff it currently points at
// handle. Called under the surface's own lock during Free so the clipboard
// callbacks (which dereference focusedSurface under focusedMu) can never read a
// pointer that is about to be / has just been freed. Clearing only on a match
// avoids stomping a newly-focused surface during a concurrent destroy.
func clearFocusedSurfaceHandle(handle C.ghostty_surface_t) {
	if handle == nil {
		return
	}
	focusedMu.Lock()
	if focusedSurface == handle {
		focusedSurface = nil
	}
	focusedMu.Unlock()
}

//export phantomGhosttyWakeupCB
func phantomGhosttyWakeupCB(userdata unsafe.Pointer) {
	if wakeupCh == nil {
		return
	}
	select {
	case wakeupCh <- struct{}{}:
	default:
	}
}

//export phantomGhosttyActionCB
func phantomGhosttyActionCB(app C.ghostty_app_t, target C.ghostty_target_s, action C.ghostty_action_s) C.bool {
	_ = app
	_ = target

	switch action.tag {
	case C.GHOSTTY_ACTION_SET_TITLE:
		p := (*C.ghostty_action_set_title_s)(unsafe.Pointer(&action.action))
		title := C.GoString(p.title)
		log.Debug("ghostty/action: set_title", "title", title)
		emitNativeTerminalEvent("native-terminal:title", title)
		return C.bool(true)

	case C.GHOSTTY_ACTION_RING_BELL:
		log.Debug("ghostty/action: bell")
		emitNativeTerminalEvent("native-terminal:bell", nil)
		return C.bool(true)

	case C.GHOSTTY_ACTION_OPEN_URL:
		p := (*C.ghostty_action_open_url_s)(unsafe.Pointer(&action.action))
		url := C.GoStringN(p.url, C.int(p.len))
		log.Debug("ghostty/action: open_url", "url", url)
		emitNativeTerminalEvent("native-terminal:open-url", url)
		return C.bool(true)

	case C.GHOSTTY_ACTION_PWD:
		p := (*C.ghostty_action_pwd_s)(unsafe.Pointer(&action.action))
		pwd := C.GoString(p.pwd)
		log.Debug("ghostty/action: pwd", "pwd", pwd)
		emitNativeTerminalEvent("native-terminal:pwd", pwd)
		return C.bool(true)

	case C.GHOSTTY_ACTION_MOUSE_SHAPE:
		log.Debug("ghostty/action: mouse_shape")
		return C.bool(true)

	case C.GHOSTTY_ACTION_RENDERER_HEALTH:
		log.Debug("ghostty/action: renderer_health")
		return C.bool(true)

	case C.GHOSTTY_ACTION_SHOW_CHILD_EXITED:
		p := (*C.ghostty_surface_message_childexited_s)(unsafe.Pointer(&action.action))
		exitCode := int(p.exit_code)
		log.Info("ghostty/action: child_exited", "exitCode", exitCode)
		emitNativeTerminalEvent("native-terminal:child-exited", exitCode)
		return C.bool(true)

	case C.GHOSTTY_ACTION_COMMAND_FINISHED:
		p := (*C.ghostty_action_command_finished_s)(unsafe.Pointer(&action.action))
		exitCode := int(p.exit_code)
		log.Debug("ghostty/action: command_finished", "exitCode", exitCode)
		return C.bool(true)

	case C.GHOSTTY_ACTION_DESKTOP_NOTIFICATION:
		p := (*C.ghostty_action_desktop_notification_s)(unsafe.Pointer(&action.action))
		title := C.GoString(p.title)
		body := C.GoString(p.body)
		log.Debug("ghostty/action: notification", "title", title, "body", body)
		return C.bool(true)

	case C.GHOSTTY_ACTION_COLOR_CHANGE:
		log.Debug("ghostty/action: color_change")
		return C.bool(true)

	case C.GHOSTTY_ACTION_SCROLLBAR:
		log.Debug("ghostty/action: scrollbar")
		return C.bool(true)

	default:
		return C.bool(false) // unhandled — let libghostty know
	}
}

//export phantomGhosttyReadClipboardCB
func phantomGhosttyReadClipboardCB(userdata unsafe.Pointer, cb C.ghostty_clipboard_e, state unsafe.Pointer) C.bool {
	focusedMu.Lock()
	surf := focusedSurface
	focusedMu.Unlock()
	if surf == nil {
		return C.bool(false)
	}

	text := C.phantom_pasteboard_read()
	if text == nil {
		return C.bool(false)
	}
	defer C.free(unsafe.Pointer(text))

	C.phantom_surface_complete_clipboard_main(surf, text, state, C.bool(true))
	return C.bool(true)
}

//export phantomGhosttyConfirmReadClipboardCB
func phantomGhosttyConfirmReadClipboardCB(userdata unsafe.Pointer, prompt *C.char, state unsafe.Pointer, req C.ghostty_clipboard_request_e) {
	focusedMu.Lock()
	surf := focusedSurface
	focusedMu.Unlock()
	if surf == nil {
		return
	}

	text := C.phantom_pasteboard_read()
	if text == nil {
		return
	}
	defer C.free(unsafe.Pointer(text))

	C.phantom_surface_complete_clipboard_main(surf, text, state, C.bool(true))
}

//export phantomGhosttyWriteClipboardCB
func phantomGhosttyWriteClipboardCB(userdata unsafe.Pointer, cb C.ghostty_clipboard_e, content *C.ghostty_clipboard_content_s, count C.size_t, confirm C.bool) {
	if content == nil || count == 0 {
		return
	}
	C.phantom_pasteboard_write(content.data)
}

//export phantomGhosttyCloseSurfaceCB
func phantomGhosttyCloseSurfaceCB(userdata unsafe.Pointer, processAlive C.bool) {
	log.Info("ghostty/closeSurface", "processAlive", bool(processAlive))
	emitNativeTerminalEvent("native-terminal:closed", !bool(processAlive))
}
