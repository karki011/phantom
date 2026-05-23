// Author: Subash Karki
package terminal

import "bytes"

// oscClaudePrefix is the OSC 633;Claude; sequence the shell function emits
// to signal that the user invoked `claude` in a Phantom terminal.
var oscClaudePrefix = []byte("\x1b]633;Claude;")

// oscTerminator is the ST (String Terminator) used by OSC sequences.
// Shells emit BEL (\a = 0x07) as the terminator.
var oscTerminator = []byte{0x07}

// DetectClaudeOSC scans data for the OSC 633;Claude;<args>\a sequence.
// If found it returns the args string (everything between "Claude;" and
// the ST terminator) and found=true. Multiple occurrences return the
// first match.
func DetectClaudeOSC(data []byte) (args string, found bool) {
	idx := bytes.Index(data, oscClaudePrefix)
	if idx < 0 {
		return "", false
	}

	// Start of the args payload — right after the prefix.
	start := idx + len(oscClaudePrefix)
	if start >= len(data) {
		return "", false
	}

	// Find the terminator (BEL).
	rest := data[start:]
	end := bytes.Index(rest, oscTerminator)
	if end < 0 {
		// Incomplete sequence (split across reads). Caller will see
		// the full sequence on the next read.
		return "", false
	}

	return string(rest[:end]), true
}
