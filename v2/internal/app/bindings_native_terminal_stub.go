//go:build !(darwin && ghostty)

// Author: Subash Karki
//
// Placeholder types when libghostty is not available (non-darwin or missing build tag).
// Native terminal is macOS-only and requires `-tags ghostty`.
package app

type nativeTerminal struct{}

type nativeHostHandle interface{}

type ghosttyAppHandle interface{}
