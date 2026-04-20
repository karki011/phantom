// Wails bindings for terminal session management.
// Author: Subash Karki
package app

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
)

// terminalWSMessage is the JSON envelope sent over WebSocket for terminal data.
type terminalWSMessage struct {
	Type      string `json:"type"`
	SessionID string `json:"session_id"`
	Payload   string `json:"payload"`
}

// CreateTerminal spawns a new PTY session and wires its output to the
// WebSocket hub so the frontend receives live terminal data.
func (a *App) CreateTerminal(id, cwd string, cols, rows int) error {
	sess, err := a.Terminal.Create(a.ctx, id, cwd, uint16(cols), uint16(rows))
	if err != nil {
		return fmt.Errorf("CreateTerminal: %w", err)
	}

	listenerID := "ws-" + id
	ch := sess.Subscribe(listenerID)

	// Forward PTY output to WebSocket hub in a background goroutine.
	go func() {
		defer func() {
			// Unsubscribe when the loop exits (session closed or app shutdown).
			sess.Unsubscribe(listenerID)

			// Emit terminal exit event via Wails runtime.
			EmitEvent(a.ctx, EventTerminalExit, map[string]string{
				"session_id": id,
			})
		}()

		for {
			select {
			case <-a.ctx.Done():
				return
			case data, ok := <-ch:
				if !ok {
					// Channel closed — session ended.
					return
				}
				msg := terminalWSMessage{
					Type:      EventTerminalData,
					SessionID: id,
					Payload:   base64.StdEncoding.EncodeToString(data),
				}
				encoded, err := json.Marshal(msg)
				if err != nil {
					log.Printf("app/bindings_terminal: marshal error for session %s: %v", id, err)
					continue
				}
				if a.wsHub != nil {
					a.wsHub.Broadcast(encoded)
				}
			}
		}
	}()

	return nil
}

// WriteTerminal sends raw text data to the terminal's PTY input.
func (a *App) WriteTerminal(id string, data string) error {
	return a.Terminal.Write(id, []byte(data))
}

// ResizeTerminal updates the PTY window size.
func (a *App) ResizeTerminal(id string, cols, rows int) error {
	return a.Terminal.Resize(id, uint16(cols), uint16(rows))
}

// DestroyTerminal closes and removes a terminal session.
func (a *App) DestroyTerminal(id string) error {
	return a.Terminal.Destroy(id)
}

// GetTerminalScrollback returns the ring buffer contents as a base64-encoded string.
// This allows the frontend to restore terminal history when re-attaching to a session.
func (a *App) GetTerminalScrollback(id string) string {
	sess, ok := a.Terminal.Get(id)
	if !ok {
		return ""
	}
	return string(sess.Scrollback.Bytes())
}
