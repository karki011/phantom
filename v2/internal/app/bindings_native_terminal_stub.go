//go:build !darwin

// Author: Subash Karki
//
// Non-darwin placeholder types so App struct compiles on linux/windows.
// Native terminal is currently macOS-only (libghostty + AppKit).
package app

type nativeTerminal struct{}

type nativeHostHandle interface{}

type ghosttyAppHandle interface{}
