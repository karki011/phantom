package ws

import "encoding/json"

const (
	TypePing   = "ping"
	TypePong   = "pong"
	TypeHealth = "health"
	TypeEvent  = "event"
)

type Message struct {
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload,omitempty"`
	SessionID string          `json:"session_id,omitempty"`
}
