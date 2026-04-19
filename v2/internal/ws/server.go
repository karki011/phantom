package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"time"

	"nhooyr.io/websocket"
)

type Server struct {
	hub      *Hub
	listener net.Listener
	server   *http.Server
	port     int
}

func NewServer(hub *Hub, port int) *Server {
	return &Server{
		hub:  hub,
		port: port,
	}
}

func (s *Server) Start(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		s.handleWS(ctx, w, r)
	})

	addr := fmt.Sprintf("localhost:%d", s.port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("ws.Server.Start: %w", err)
	}
	s.listener = listener

	s.server = &http.Server{Handler: mux}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.server.Shutdown(shutdownCtx)
	}()

	go s.server.Serve(listener)

	return nil
}

func (s *Server) Port() int {
	if s.listener != nil {
		return s.listener.Addr().(*net.TCPAddr).Port
	}
	return s.port
}

func (s *Server) handleWS(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "closing")

	s.hub.Register(conn)
	defer s.hub.Unregister(conn)

	for {
		msgType, data, err := conn.Read(ctx)
		if err != nil {
			return
		}

		if msgType == websocket.MessageText {
			var msg Message
			if json.Unmarshal(data, &msg) == nil && msg.Type == TypePing {
				resp := Message{Type: TypePong}
				respBytes, _ := json.Marshal(resp)
				conn.Write(ctx, websocket.MessageText, respBytes)
			}
		}
	}
}
