package ws

import (
	"context"
	"sync"

	"nhooyr.io/websocket"
)

type Hub struct {
	mu        sync.RWMutex
	clients   map[*websocket.Conn]struct{}
	broadcast chan []byte
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[*websocket.Conn]struct{}),
		broadcast: make(chan []byte, 256),
	}
}

func (h *Hub) Register(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[conn] = struct{}{}
}

func (h *Hub) Unregister(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, conn)
}

func (h *Hub) Broadcast(msg []byte) {
	h.broadcast <- msg
}

func (h *Hub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-h.broadcast:
			h.mu.RLock()
			for conn := range h.clients {
				conn.Write(ctx, websocket.MessageText, msg)
			}
			h.mu.RUnlock()
		}
	}
}
