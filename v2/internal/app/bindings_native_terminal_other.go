//go:build !darwin

// Author: Subash Karki
//
// Non-darwin stubs — the libghostty integration is macOS-only today.
package app

import "errors"

func (a *App) NativeTerminalIsEnabled() bool { return false }

func (a *App) SetNativeTerminalEnabled(on bool) {}

func (a *App) NativeTerminalCreate(paneID, worktreeID, cwd string) (string, error) {
	return "", errors.New("native terminal not supported on this platform")
}

func (a *App) NativeTerminalSetPlacement(paneID string, x, y, width, height float64) {}

func (a *App) NativeTerminalDestroy(paneID string) {}

func (a *App) NativeTerminalFocus(paneID string) {}

func (a *App) shutdownNativeTerminals() {}
