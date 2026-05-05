// Author: Subash Karki
//
// handshake.go implements the startup handshake protocol between Phantom and
// the Claude CLI subprocess. After Spawn(), the handshake validates that the
// CLI is responsive and speaking the expected stream-JSON dialect before we
// accept user input.
package composer

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

// DefaultHandshakeTimeout is the maximum time to wait for the CLI to respond
// with a system_info event after spawn.
const DefaultHandshakeTimeout = 5 * time.Second

// HandshakeResult captures the outcome of a post-spawn handshake.
type HandshakeResult struct {
	// SessionID is the Claude session ID reported by the CLI.
	SessionID string `json:"session_id"`

	// CLIVersion is the CLI version string, if reported in system_info.
	CLIVersion string `json:"cli_version"`

	// Capabilities lists feature flags or protocol extensions the CLI advertises.
	Capabilities []string `json:"capabilities"`

	// Valid is true when the handshake completed without error.
	Valid bool `json:"valid"`

	// Error describes what went wrong when Valid is false.
	Error string `json:"error,omitempty"`
}

// handshakeProbe is the no-op message sent to stdin to trigger the CLI's
// initial system_info response. The Claude CLI emits system_info on
// first stdin activity in stream-json mode.
var handshakeProbe = []byte(`{"type":"ping","subtype":"handshake"}`)

// Handshake sends a probe message and waits for the first system_info or
// session_resumed event from the CLI. It validates the event shape and
// extracts the session ID.
//
// Callers should invoke Handshake immediately after Spawn(). If it fails,
// the session should be stopped and the caller should fall back to a
// degraded (V1) mode.
func (s *Session) Handshake(timeout time.Duration) (HandshakeResult, error) {
	if timeout <= 0 {
		timeout = DefaultHandshakeTimeout
	}

	var (
		mu     sync.Mutex
		result HandshakeResult
		done   = make(chan struct{})
	)

	// Register a temporary event handler to capture the first qualifying event.
	captureOnce := sync.OnceFunc(func() {
		close(done)
	})

	handler := func(ev StreamEvent) {
		// We only care about system_info or session_resumed.
		switch ev.Kind {
		case EventSystemInfo, EventSessionResumed:
			mu.Lock()
			result = HandshakeResult{
				SessionID:  ev.SessionID,
				CLIVersion: extractCLIVersion(ev),
				Valid:      true,
			}
			mu.Unlock()
			captureOnce()

		case EventError:
			mu.Lock()
			result = HandshakeResult{
				Valid: false,
				Error: ev.Text,
			}
			mu.Unlock()
			captureOnce()
		}
	}

	s.OnEvent(handler)

	// Send the probe to trigger CLI response.
	if err := s.Send(handshakeProbe); err != nil {
		return HandshakeResult{
			Valid: false,
			Error: fmt.Sprintf("failed to send handshake probe: %v", err),
		}, fmt.Errorf("handshake probe send: %w", err)
	}

	// Wait for the handler to fire or timeout.
	select {
	case <-done:
		mu.Lock()
		r := result
		mu.Unlock()

		if !r.Valid {
			return r, fmt.Errorf("handshake failed: %s", r.Error)
		}
		return r, nil

	case <-time.After(timeout):
		return HandshakeResult{
			Valid: false,
			Error: fmt.Sprintf("handshake timed out after %s — CLI did not respond", timeout),
		}, fmt.Errorf("handshake timed out after %s", timeout)
	}
}

// extractCLIVersion attempts to pull a version string from the event's Raw
// JSON payload (system_info events may include {"version": "1.0.33"}).
func extractCLIVersion(ev StreamEvent) string {
	if len(ev.Raw) == 0 {
		return ""
	}

	var payload struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(ev.Raw, &payload); err == nil && payload.Version != "" {
		return payload.Version
	}
	return ""
}
