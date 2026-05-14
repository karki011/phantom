//go:build darwin && ghostty

// Author: Subash Karki
//
// Cross-platform handle types for the native terminal binding. The real
// libghostty integration only links on darwin; on other platforms the
// stub_other.go file provides nil-able placeholders so the App struct
// compiles everywhere.
package app

import (
	"github.com/subashkarki/phantom-os-v2/internal/terminal/ghostty"
)

type nativeTerminal struct {
	surface *ghostty.Surface
	view    uintptr
}

type nativeHostHandle = *ghostty.HostWindow

type ghosttyAppHandle = *ghostty.App
