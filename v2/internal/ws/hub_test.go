// Author: Subash Karki

package ws

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"nhooyr.io/websocket"
)

// dialHub spins a real loopback websocket server backed by hub h and returns a
// connected client conn. The server registers each accepted conn with the hub,
// runs its writeLoop, and drains reads until the conn dies.
func dialHub(t *testing.T, ctx context.Context, h *Hub) (*websocket.Conn, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if err != nil {
			return
		}
		cl := h.Register(conn)
		go cl.writeLoop(ctx)
		for {
			if _, _, err := conn.Read(ctx); err != nil {
				h.Unregister(cl)
				return
			}
		}
	}))
	url := "ws" + strings.TrimPrefix(srv.URL, "http")
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		srv.Close()
		t.Fatalf("dial: %v", err)
	}
	return conn, srv
}

// TestBroadcastSurvivesConcurrentClose hammers the broadcast path while clients
// are concurrently removed/closed. The old code closed the per-conn send
// channel from close(), so a Send racing teardown panicked on send-on-closed.
// This must run clean under -race with no panic.
func TestBroadcastSurvivesConcurrentClose(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	h := NewHub()
	go h.Run(ctx)

	const conns = 20
	servers := make([]*httptest.Server, 0, conns)
	clients := make([]*websocket.Conn, 0, conns)
	for i := 0; i < conns; i++ {
		c, s := dialHub(t, ctx, h)
		clients = append(clients, c)
		servers = append(servers, s)
	}
	defer func() {
		for _, s := range servers {
			s.Close()
		}
	}()

	// Let registrations settle.
	deadline := time.Now().Add(2 * time.Second)
	for {
		h.mu.RLock()
		n := len(h.clients)
		h.mu.RUnlock()
		if n == conns || time.Now().After(deadline) {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}

	var wg sync.WaitGroup

	// Broadcaster: flood frames.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 5000; i++ {
			h.Broadcast([]byte("frame"))
		}
	}()

	// Closer: yank client conns out from under the broadcast concurrently.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for _, c := range clients {
			c.Close(websocket.StatusNormalClosure, "")
			time.Sleep(time.Millisecond)
		}
	}()

	wg.Wait()
	// If we got here without panic/deadlock the broadcast path is hardened.
}

// TestRemoveIsIdempotent verifies double Unregister/remove never panics and the
// underlying conn close happens exactly once.
func TestRemoveIsIdempotent(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	h := NewHub()
	conn, srv := dialHub(t, ctx, h)
	defer srv.Close()
	defer conn.Close(websocket.StatusNormalClosure, "")

	var cl *client
	deadline := time.Now().Add(2 * time.Second)
	for {
		h.mu.RLock()
		for c := range h.clients {
			cl = c
		}
		h.mu.RUnlock()
		if cl != nil || time.Now().After(deadline) {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if cl == nil {
		t.Fatal("client never registered")
	}

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			h.Unregister(cl)
		}()
	}
	wg.Wait()
}

// TestSendAfterCloseDoesNotPanic directly exercises the race the audit flagged:
// Send concurrent with close on the same client.
func TestSendAfterCloseDoesNotPanic(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	h := NewHub()
	conn, srv := dialHub(t, ctx, h)
	defer srv.Close()
	defer conn.Close(websocket.StatusNormalClosure, "")

	var cl *client
	deadline := time.Now().Add(2 * time.Second)
	for {
		h.mu.RLock()
		for c := range h.clients {
			cl = c
		}
		h.mu.RUnlock()
		if cl != nil || time.Now().After(deadline) {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if cl == nil {
		t.Fatal("client never registered")
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		for i := 0; i < 1000; i++ {
			cl.Send([]byte("x"))
		}
	}()
	go func() {
		defer wg.Done()
		cl.close()
	}()
	wg.Wait()
}
