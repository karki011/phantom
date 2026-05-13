// Author: Subash Karki
//
// Spike-quality CGo bridge to libghostty.
//
// Currently exposes only ghostty_info() / ghostty_translate() / ghostty_string_free()
// to prove the link chain works end-to-end. Full surface lifecycle (app_new,
// surface_new, runtime_config, NSView wiring) is the multi-week effort tracked
// in .planning/native-feel/LIBGHOSTTY-INTEGRATION.md.
//
// Build prereqs: see Makefile target `libghostty`. The .a is produced under
// third_party/ghostty/macos/GhosttyKit.xcframework/macos-arm64/.
package ghostty

/*
#cgo CFLAGS: -I${SRCDIR}/../../../third_party/ghostty/include -DGHOSTTY_STATIC
#cgo LDFLAGS: -L${SRCDIR}/../../../third_party/ghostty/macos/GhosttyKit.xcframework/macos-arm64 -lghostty-internal-fat
#cgo LDFLAGS: -framework AppKit -framework CoreText -framework CoreGraphics -framework Metal -framework MetalKit -framework UniformTypeIdentifiers -framework AVFoundation -framework Carbon -framework UserNotifications -framework IOSurface -framework QuartzCore -framework Foundation -lobjc -lc++

#include <stdlib.h>
#include "ghostty.h"
*/
import "C"

import (
	"errors"
	"runtime"
	"sync"
	"unsafe"
)

var (
	initOnce sync.Once
	initErr  error
)

// Available reports whether libghostty is linked into this build.
// When the build was made without the ghostty static library, this returns
// false and all other calls will return ErrNotAvailable.
func Available() bool {
	return runtime.GOOS == "darwin"
}

// ErrNotAvailable is returned when libghostty isn't usable on this build.
var ErrNotAvailable = errors.New("libghostty not available on this platform")

// Info mirrors ghostty_info_s — diagnostic data about the linked library.
type Info struct {
	Version    string
	BuildMode  string
	BuildTime  string
	CompileFlags []string
}

// Init initializes libghostty. Safe to call multiple times.
func Init() error {
	if !Available() {
		return ErrNotAvailable
	}
	initOnce.Do(func() {
		rc := C.ghostty_init(0, nil)
		if rc != C.GHOSTTY_SUCCESS {
			initErr = errors.New("ghostty_init failed")
		}
	})
	return initErr
}

// GetInfo returns version + build info for diagnostics.
func GetInfo() (Info, error) {
	if !Available() {
		return Info{}, ErrNotAvailable
	}
	if err := Init(); err != nil {
		return Info{}, err
	}
	cinfo := C.ghostty_info()
	out := Info{
		Version: C.GoString(cinfo.version),
	}
	switch cinfo.build_mode {
	case C.GHOSTTY_BUILD_MODE_DEBUG:
		out.BuildMode = "debug"
	case C.GHOSTTY_BUILD_MODE_RELEASE_SAFE:
		out.BuildMode = "release-safe"
	case C.GHOSTTY_BUILD_MODE_RELEASE_FAST:
		out.BuildMode = "release-fast"
	case C.GHOSTTY_BUILD_MODE_RELEASE_SMALL:
		out.BuildMode = "release-small"
	}
	return out, nil
}

// Translate returns a localized string from libghostty's translation table.
// Useful for verifying the library is functional end-to-end.
func Translate(key string) (string, error) {
	if !Available() {
		return "", ErrNotAvailable
	}
	if err := Init(); err != nil {
		return "", err
	}
	ckey := C.CString(key)
	defer C.free(unsafe.Pointer(ckey))
	cstr := C.ghostty_translate(ckey)
	return C.GoString(cstr), nil
}
