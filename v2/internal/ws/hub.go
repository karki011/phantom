// Author: Subash Karki

package ws

import (
	"context"
	"sync"

	"nhooyr.io/websocket"
)

// sendBuffer bounds per-client backpressure. A client that cannot keep up
// within this many queued frames is disconnected rather than allowed to
// block the broadcast path for every other client.
const sendBuffer = 64

// client owns a single websocket connection and is the only writer to it.
// All frames (broadcasts and pong replies) flow through send, which the
// client's own writer goroutine drains — this guarantees the nhooyr
// single-writer invariant and prevents a slow/dead peer from stalling others.
//
// done is closed exactly once by close. The send channel is never closed:
// closing a producer-fed channel risks a send-on-closed-channel panic when a
// concurrent Send races with teardown. Instead every Send and the writeLoop
// select against done, so teardown is a pure signal and Send is panic-proof.
type client struct {
	conn      *websocket.Conn
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once
	hub       *Hub
}

// Send queues a frame without blocking. If the client is already closing the
// frame is dropped. If the buffer is full the client is considered stuck and
// is disconnected; the frame is dropped. Safe to call from any goroutine and
// never panics, even concurrently with close.
func (c *client) Send(msg []byte) {
	select {
	case <-c.done:
		return
	case c.send <- msg:
	default:
		c.hub.remove(c)
	}
}

// close tears the client down exactly once: signal the writer goroutine to
// stop and force the connection shut. Idempotent and safe to call from any
// goroutine.
func (c *client) close() {
	c.closeOnce.Do(func() {
		close(c.done)
		c.conn.CloseNow()
	})
}

// writeLoop is the sole writer for the connection. It exits when the client is
// closed (done signalled) or when a write fails, evicting the client on error.
func (c *client) writeLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			c.hub.remove(c)
			return
		case <-c.done:
			return
		case msg := <-c.send:
			if err := c.conn.Write(ctx, websocket.MessageText, msg); err != nil {
				c.hub.remove(c)
				return
			}
		}
	}
}

type Hub struct {
	mu        sync.RWMutex
	clients   map[*client]struct{}
	broadcast chan []byte
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[*client]struct{}),
		broadcast: make(chan []byte, 256),
	}
}

// Register adds a connection to the hub and returns its client handle. The
// caller must run cl.writeLoop and call Unregister when the connection ends.
func (h *Hub) Register(conn *websocket.Conn) *client {
	cl := &client{
		conn: conn,
		send: make(chan []byte, sendBuffer),
		done: make(chan struct{}),
		hub:  h,
	}
	h.mu.Lock()
	h.clients[cl] = struct{}{}
	h.mu.Unlock()
	return cl
}

// Unregister removes a client and closes its connection (idempotent).
func (h *Hub) Unregister(cl *client) {
	if cl != nil {
		h.remove(cl)
	}
}

// remove deletes the client from the set under lock, then closes it outside
// the lock. close is guarded by sync.Once so concurrent removers are safe.
func (h *Hub) remove(cl *client) {
	h.mu.Lock()
	_, present := h.clients[cl]
	if present {
		delete(h.clients, cl)
	}
	h.mu.Unlock()
	if present {
		cl.close()
	}
}

func (h *Hub) Broadcast(msg []byte) {
	select {
	case h.broadcast <- msg:
	default:
		// Hub-level overflow: drop to keep producers non-blocking.
	}
}

func (h *Hub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			h.closeAll()
			return
		case msg := <-h.broadcast:
			// Snapshot under RLock so the map is never mutated mid-range;
			// per-client sends happen after the lock is released.
			h.mu.RLock()
			targets := make([]*client, 0, len(h.clients))
			for cl := range h.clients {
				targets = append(targets, cl)
			}
			h.mu.RUnlock()

			for _, cl := range targets {
				cl.Send(msg)
			}
		}
	}
}

func (h *Hub) closeAll() {
	h.mu.Lock()
	targets := make([]*client, 0, len(h.clients))
	for cl := range h.clients {
		targets = append(targets, cl)
	}
	h.clients = make(map[*client]struct{})
	h.mu.Unlock()

	for _, cl := range targets {
		cl.close()
	}
}
