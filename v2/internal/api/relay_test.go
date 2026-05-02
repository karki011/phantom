// Author: Subash Karki
//
// Integration tests for the hook relay API endpoint (POST /api/hooks/relay).
package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// TestHookRelayEndpoint_Success tests that a valid HookRelayEvent is accepted
// and the OnEvent callback is invoked.
func TestHookRelayEndpoint_Success(t *testing.T) {
	t.Parallel()

	var received []HookRelayEvent
	var mu sync.Mutex

	deps := ServerDeps{
		OnEvent: func(name string, data any) {
			mu.Lock()
			defer mu.Unlock()
			if name == "hook:tool-event" {
				if ev, ok := data.(HookRelayEvent); ok {
					received = append(received, ev)
				}
			}
		},
	}

	srv := NewServer(0, deps)

	event := HookRelayEvent{
		Type:      "tool_use",
		HookType:  "post-tool",
		SessionID: "session-123",
		ToolName:  "Edit",
		CWD:       "/repo/project",
		Timestamp: 1700000000,
	}
	body, _ := json.Marshal(event)

	req := httptest.NewRequest("POST", "/api/hooks/relay", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	mu.Lock()
	defer mu.Unlock()
	if len(received) != 1 {
		t.Fatalf("expected OnEvent called 1 time, got %d", len(received))
	}
	if received[0].ToolName != "Edit" {
		t.Errorf("expected ToolName 'Edit', got %q", received[0].ToolName)
	}
	if received[0].SessionID != "session-123" {
		t.Errorf("expected SessionID 'session-123', got %q", received[0].SessionID)
	}
}

// TestHookRelayEndpoint_InvalidJSON tests that malformed JSON returns 400.
func TestHookRelayEndpoint_InvalidJSON(t *testing.T) {
	t.Parallel()

	srv := NewServer(0, ServerDeps{})

	req := httptest.NewRequest("POST", "/api/hooks/relay", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid JSON, got %d", w.Code)
	}
}

// TestHookRelayEndpoint_EmptyBody tests that an empty body returns 400.
func TestHookRelayEndpoint_EmptyBody(t *testing.T) {
	t.Parallel()

	srv := NewServer(0, ServerDeps{})

	req := httptest.NewRequest("POST", "/api/hooks/relay", bytes.NewReader([]byte("")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	srv.mux.ServeHTTP(w, req)

	// Empty body is invalid JSON.
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty body, got %d", w.Code)
	}
}

// TestHookRelayEndpoint_NilOnEvent tests that the endpoint works without
// an OnEvent callback.
func TestHookRelayEndpoint_NilOnEvent(t *testing.T) {
	t.Parallel()

	srv := NewServer(0, ServerDeps{OnEvent: nil})

	event := HookRelayEvent{
		Type:      "tool_use",
		ToolName:  "Read",
		SessionID: "s-1",
	}
	body, _ := json.Marshal(event)

	req := httptest.NewRequest("POST", "/api/hooks/relay", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 with nil OnEvent, got %d", w.Code)
	}
}

// TestHealthEndpoint tests the /health endpoint returns 200 with status ok.
func TestHealthEndpoint(t *testing.T) {
	t.Parallel()

	srv := NewServer(3849, ServerDeps{})

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]any
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["status"] != "ok" {
		t.Errorf("expected status 'ok', got %v", resp["status"])
	}
}

// TestHookHealthReport tests the hook health reporting endpoint.
func TestHookHealthReport(t *testing.T) {
	t.Parallel()

	srv := NewServer(0, ServerDeps{})

	// Report health.
	report := map[string]string{
		"hook":   "prompt-enricher",
		"status": "success",
	}
	body, _ := json.Marshal(report)

	req := httptest.NewRequest("POST", "/api/hook-health/report", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("report: expected 200, got %d", w.Code)
	}

	// Get health.
	req = httptest.NewRequest("GET", "/api/hook-health", nil)
	w = httptest.NewRecorder()

	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("get health: expected 200, got %d", w.Code)
	}

	var entries []hookHealthEntry
	if err := json.NewDecoder(w.Body).Decode(&entries); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 health entry, got %d", len(entries))
	}
	if entries[0].Hook != "prompt-enricher" {
		t.Errorf("expected hook 'prompt-enricher', got %q", entries[0].Hook)
	}
	if entries[0].Status != "success" {
		t.Errorf("expected status 'success', got %q", entries[0].Status)
	}
}
