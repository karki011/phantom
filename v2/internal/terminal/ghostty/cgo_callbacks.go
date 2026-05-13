// Author: Subash Karki
//
// CGo //export functions called by libghostty back into Go. These are the
// minimal contracts to keep libghostty happy. Real implementations will
// route through to Wails events / per-surface handlers.
//
// IMPORTANT: //export functions are visible to C as exact symbol names —
// libghostty references them by the names declared in runtime.go's C block.
package ghostty

/*
#include <stdbool.h>
#include "ghostty.h"
*/
import "C"

import "unsafe"

//export phantomGhosttyWakeupCB
func phantomGhosttyWakeupCB(userdata unsafe.Pointer) {
	// Real impl: signal the run loop that work is pending. No-op for spike.
	_ = userdata
}

//export phantomGhosttyActionCB
func phantomGhosttyActionCB(app C.ghostty_app_t, target C.ghostty_target_s, action C.ghostty_action_s) C.bool {
	// Real impl: dispatch on action.tag to native handler. Returning true means handled.
	_ = app
	_ = target
	_ = action
	return C.bool(true)
}

//export phantomGhosttyReadClipboardCB
func phantomGhosttyReadClipboardCB(userdata unsafe.Pointer, cb C.ghostty_clipboard_e, state unsafe.Pointer) C.bool {
	// Real impl: read NSPasteboard and feed back via ghostty_surface_complete_clipboard_request.
	_ = userdata
	_ = cb
	_ = state
	return C.bool(false)
}

//export phantomGhosttyConfirmReadClipboardCB
func phantomGhosttyConfirmReadClipboardCB(userdata unsafe.Pointer, prompt *C.char, state unsafe.Pointer, req C.ghostty_clipboard_request_e) {
	// Real impl: show confirmation dialog. No-op for spike.
	_ = userdata
	_ = prompt
	_ = state
	_ = req
}

//export phantomGhosttyWriteClipboardCB
func phantomGhosttyWriteClipboardCB(userdata unsafe.Pointer, cb C.ghostty_clipboard_e, content *C.ghostty_clipboard_content_s, count C.size_t, confirm C.bool) {
	// Real impl: write to NSPasteboard. No-op for spike.
	_ = userdata
	_ = cb
	_ = content
	_ = count
	_ = confirm
}

//export phantomGhosttyCloseSurfaceCB
func phantomGhosttyCloseSurfaceCB(userdata unsafe.Pointer, processAlive C.bool) {
	// Real impl: signal the host that a surface wants to close.
	_ = userdata
	_ = processAlive
}
