// Linker-specific error types.
// Author: Subash Karki
package linker

import "fmt"

func errNoTerminal(paneID string) error {
	return fmt.Errorf("linker: terminal %q not found in manager", paneID)
}

func errNoPID(paneID string) error {
	return fmt.Errorf("linker: terminal %q has no PID", paneID)
}

func errNoPIDMatch(paneID string) error {
	return fmt.Errorf("linker: no PID ancestry match for terminal %q", paneID)
}
