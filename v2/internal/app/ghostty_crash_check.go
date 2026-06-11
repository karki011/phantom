// Author: Subash Karki
//
// Crash-envelope observability for the native (libghostty) terminal.
// libghostty bundles a sentry-native crash handler that swallows native
// crashes (EXC_BAD_ACCESS etc.) and writes an envelope to
// ~/.local/state/ghostty/crash/ — the app just exits silently. At startup
// we scan that directory for envelopes newer than the previous launch and
// log loudly so a native-terminal crash from the last session is visible
// instead of silent. Dependency-free: os.ReadDir + ModTime, with the
// last-seen timestamp persisted under ~/.phantom-os/ghostty-crash-marker.

package app

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/charmbracelet/log"
)

const ghosttyCrashMarkerFile = "ghostty-crash-marker"

// checkGhosttyCrashEnvelopes detects libghostty crash envelopes written
// since the previous app launch and warns loudly. On the very first run
// (no marker yet) it only initializes the marker — pre-existing envelopes
// may belong to a standalone Ghostty install and would be noise.
func checkGhosttyCrashEnvelopes() {
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	crashDir := filepath.Join(home, ".local", "state", "ghostty", "crash")
	markerPath := filepath.Join(home, ".phantom-os", ghosttyCrashMarkerFile)

	var lastSeen time.Time
	markerExisted := false
	if raw, rerr := os.ReadFile(markerPath); rerr == nil {
		if t, perr := time.Parse(time.RFC3339Nano, strings.TrimSpace(string(raw))); perr == nil {
			lastSeen = t
			markerExisted = true
		}
	}

	now := time.Now()
	defer writeGhosttyCrashMarker(markerPath, now)

	// First run (no marker yet): just initialize the marker, skip the scan.
	if !markerExisted {
		return
	}

	entries, err := os.ReadDir(crashDir)
	if err != nil {
		return // directory absent = no crashes ever
	}

	count := 0
	var newestName string
	var newestMod time.Time
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".ghosttycrash") {
			continue
		}
		info, ierr := e.Info()
		if ierr != nil || !info.ModTime().After(lastSeen) {
			continue
		}
		count++
		if info.ModTime().After(newestMod) {
			newestMod = info.ModTime()
			newestName = e.Name()
		}
	}

	if count == 0 {
		return
	}
	log.Warn("NATIVE TERMINAL CRASHED LAST SESSION — new libghostty crash envelope(s) found",
		"count", count,
		"newest", newestName,
		"dir", crashDir,
		"hint", "libghostty's bundled sentry-native handler swallows the crash, so the app exited silently; inspect the envelope for the native stack")
}

func writeGhosttyCrashMarker(path string, t time.Time) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}
	_ = os.WriteFile(path, []byte(t.Format(time.RFC3339Nano)), 0o644)
}
