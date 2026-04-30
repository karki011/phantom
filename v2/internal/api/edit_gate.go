// Phantom — Edit Gate touch store.
//
// Tracks which file paths were recently analysed via phantom_before_edit so
// the edit-gate hook can permit subsequent edits without unconditionally
// blocking. Lives in-process inside the Wails API server; the MCP process
// (cmd/phantom-mcp) records touches over HTTP after each phantom_before_edit
// call, and the hook checks via HTTP before deciding to block or allow.
//
// Author: Subash Karki
package api

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"sync"
	"time"
)

// EditGateTTL is how long a phantom_before_edit "touch" remains valid for.
// Long enough to cover the natural multi-edit flow that follows analysis,
// short enough that stale entries don't accumulate semantic risk.
const EditGateTTL = 5 * time.Minute

// EditGateStore is a thread-safe map of absolute file paths to their last
// "touched" timestamp (i.e. the last time phantom_before_edit was called
// for that path). Entries automatically expire after EditGateTTL.
type EditGateStore struct {
	mu      sync.RWMutex
	entries map[string]time.Time
}

// NewEditGateStore constructs a fresh store and starts a periodic GC
// goroutine that prunes expired entries.
func NewEditGateStore() *EditGateStore {
	s := &EditGateStore{entries: make(map[string]time.Time)}
	go s.gcLoop()
	return s
}

// Touch records each path as recently analysed. Empty/blank paths are
// ignored. Paths are stored after filepath.Clean so callers don't need to
// worry about trailing slashes or "." segments.
func (s *EditGateStore) Touch(paths []string) int {
	if len(paths) == 0 {
		return 0
	}
	now := time.Now()
	count := 0
	s.mu.Lock()
	for _, p := range paths {
		if p == "" {
			continue
		}
		s.entries[filepath.Clean(p)] = now
		count++
	}
	s.mu.Unlock()
	return count
}

// Allowed reports whether the given path was touched within the TTL.
func (s *EditGateStore) Allowed(path string) bool {
	if path == "" {
		return false
	}
	cleaned := filepath.Clean(path)
	s.mu.RLock()
	t, ok := s.entries[cleaned]
	s.mu.RUnlock()
	return ok && time.Since(t) < EditGateTTL
}

// Size returns the current number of tracked entries (for diagnostics).
func (s *EditGateStore) Size() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.entries)
}

func (s *EditGateStore) gcLoop() {
	ticker := time.NewTicker(EditGateTTL)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-EditGateTTL)
		s.mu.Lock()
		for p, ts := range s.entries {
			if ts.Before(cutoff) {
				delete(s.entries, p)
			}
		}
		s.mu.Unlock()
	}
}

// ── HTTP handlers ──────────────────────────────────────────────────────────

// editGateTouchRequest is the JSON body of POST /api/edit-gate/touch.
type editGateTouchRequest struct {
	Paths []string `json:"paths"`
}

// handleEditGateTouch records phantom_before_edit calls. Best-effort: if
// the request body is malformed we respond 400 but never error out the
// caller, since this is a fire-and-forget side channel.
func (s *Server) handleEditGateTouch(w http.ResponseWriter, r *http.Request) {
	if s.editGate == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "reason": "edit-gate store not configured"})
		return
	}
	var body editGateTouchRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}
	count := s.editGate.Touch(body.Paths)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"touched": count,
		"ttlSec":  int(EditGateTTL.Seconds()),
	})
}

// handleEditGateCheck answers "may this file be edited without invoking
// phantom_before_edit again?". Returns {allowed: bool, ttlSec: int}.
func (s *Server) handleEditGateCheck(w http.ResponseWriter, r *http.Request) {
	if s.editGate == nil {
		writeJSON(w, http.StatusOK, map[string]any{"allowed": false, "reason": "store not configured"})
		return
	}
	path := r.URL.Query().Get("path")
	allowed := s.editGate.Allowed(path)
	writeJSON(w, http.StatusOK, map[string]any{
		"allowed": allowed,
		"ttlSec":  int(EditGateTTL.Seconds()),
	})
}
