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
)

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

//export phantomGhosttyWakeupCB
func phantomGhosttyWakeupCB(userdata unsafe.Pointer) {
	_ = userdata
}

//export phantomGhosttyActionCB
func phantomGhosttyActionCB(app C.ghostty_app_t, target C.ghostty_target_s, action C.ghostty_action_s) C.bool {
	_ = app
	_ = target
	_ = action
	return C.bool(true)
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
	_ = userdata
	_ = processAlive
}
