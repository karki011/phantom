// PID ancestry checking for disambiguating terminals with same CWD.
// Author: Subash Karki
package linker

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// maxAncestryDepth prevents infinite loops when walking up the PID tree.
const maxAncestryDepth = 50

// IsDescendant returns true if childPID is a direct or indirect descendant
// of parentPID. It walks up the process tree from child to parent, which is
// O(depth) — much cheaper than walking the entire subtree downward.
//
// Returns false on ANY error (dead process, permission denied, etc.).
func IsDescendant(childPID, parentPID int) bool {
	if childPID <= 0 || parentPID <= 0 {
		return false
	}
	if childPID == parentPID {
		return true
	}

	current := childPID
	for depth := 0; depth < maxAncestryDepth; depth++ {
		ppid, err := getParentPID(current)
		if err != nil {
			return false
		}
		if ppid == parentPID {
			return true
		}
		// Reached init (1) or kernel (0) — stop.
		if ppid <= 1 {
			return false
		}
		current = ppid
	}

	return false
}

// getParentPID runs `ps -o ppid= -p <pid>` and parses the parent PID.
func getParentPID(pid int) (int, error) {
	out, err := exec.Command("ps", "-o", "ppid=", "-p", strconv.Itoa(pid)).Output()
	if err != nil {
		return 0, fmt.Errorf("getParentPID(%d): %w", pid, err)
	}

	trimmed := strings.TrimSpace(string(out))
	if trimmed == "" {
		return 0, fmt.Errorf("getParentPID(%d): empty output", pid)
	}

	ppid, err := strconv.Atoi(trimmed)
	if err != nil {
		return 0, fmt.Errorf("getParentPID(%d): parse %q: %w", pid, trimmed, err)
	}

	return ppid, nil
}
