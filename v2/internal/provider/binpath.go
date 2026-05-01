// Author: Subash Karki
package provider

import (
	"os"
	"os/exec"
)

// ResolveBin returns the absolute path of the named binary, checking PATH
// first then each candidate path in order. Candidate paths support `~/`
// expansion through ExpandPath. Returns ("", false) if none match.
//
// macOS GUI apps don't inherit the user's shell PATH, so candidates let
// callers list known install locations the bundle still needs to find.
func ResolveBin(name string, candidates []string) (string, bool) {
	if name == "" {
		return "", false
	}
	if p, err := exec.LookPath(name); err == nil {
		return p, true
	}
	for _, raw := range candidates {
		resolved := ExpandPath(raw)
		if _, err := os.Stat(resolved); err == nil {
			return resolved, true
		}
	}
	return "", false
}
