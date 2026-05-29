//go:build ghostty

// Author: Subash Karki
package main

/*
#include <locale.h>
#include <stdlib.h>
*/
import "C"

import "unsafe"

// warmLocale loads the C locale tables once, synchronously, on the main OS
// thread at startup — before any goroutine forks a subprocess.
//
// Why this exists: libghostty's init (ghostty_init → ensureLocale, see
// internal/terminal/ghostty/bridge.go) calls setlocale(LC_ALL, "") which
// mallocs while loading the LC_CTYPE / LC_TIME tables. The packaged app kicks
// off goroutines in App.Startup that immediately fork+exec subprocesses via
// cgo (git worktree prune, git fetch, gh). Go's cgo exec path uses libc
// fork(), which runs _malloc_fork_prepare to grab every malloc zone lock. If a
// fork lands while libghostty's setlocale is mid-malloc holding a zone lock,
// the two lock orders invert and the process deadlocks on launch (the kernel
// reports a 2-thread turnstile deadlock; the app hangs ~40s and is killed).
//
// Loading the tables here, before any fork can happen, makes every later
// setlocale call — including libghostty's — a cached read with no malloc,
// closing the race permanently. libghostty itself is untouched.
func warmLocale() {
	empty := C.CString("")
	defer C.free(unsafe.Pointer(empty))
	C.setlocale(C.LC_ALL, empty)
}
