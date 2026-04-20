// Author: Subash Karki
package terminal

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
)

const (
	readBufSize     = 4096 // 4KB read buffer for PTY goroutine
	listenerBufSize = 256  // buffered channel capacity per listener
)

// Session represents a single PTY-backed terminal session.
type Session struct {
	ID  string
	PTY *os.File
	Cmd *exec.Cmd

	Ctx    context.Context
	Cancel context.CancelFunc

	mu        sync.RWMutex
	listeners map[string]chan []byte

	Scrollback *RingBuffer

	Cols uint16
	Rows uint16
	CWD  string
	Shell string

	CreatedAt    time.Time
	LastActiveAt time.Time
}

// SessionInfo is a read-only metadata snapshot of a Session.
type SessionInfo struct {
	ID           string    `json:"id"`
	CWD          string    `json:"cwd"`
	Shell        string    `json:"shell"`
	Cols         uint16    `json:"cols"`
	Rows         uint16    `json:"rows"`
	CreatedAt    time.Time `json:"created_at"`
	LastActiveAt time.Time `json:"last_active_at"`
	PID          int       `json:"pid"`
}

// Start launches the background goroutine that reads from the PTY fd, fans
// output to every registered listener, and writes to the scrollback ring
// buffer. The goroutine exits when the PTY reaches EOF or the session context
// is cancelled.
func (s *Session) Start() {
	go s.readLoop()
}

// readLoop is the hot-path PTY reader. It reuses a single 4KB buffer to
// minimise allocations.
func (s *Session) readLoop() {
	buf := make([]byte, readBufSize)

	defer func() {
		// Close all listener channels on exit.
		s.mu.Lock()
		for id, ch := range s.listeners {
			close(ch)
			delete(s.listeners, id)
		}
		s.mu.Unlock()
	}()

	for {
		select {
		case <-s.Ctx.Done():
			return
		default:
		}

		n, err := s.PTY.Read(buf)
		if n > 0 {
			// Copy the read slice — buf is reused across iterations.
			data := make([]byte, n)
			copy(data, buf[:n])

			// Update activity timestamp.
			s.mu.Lock()
			s.LastActiveAt = time.Now()
			s.mu.Unlock()

			// Write to scrollback ring buffer (thread-safe internally).
			_, _ = s.Scrollback.Write(data)

			// Fan out to listeners.
			s.mu.RLock()
			for _, ch := range s.listeners {
				select {
				case ch <- data:
				default:
					// Listener is slow — drop frame to avoid blocking
					// the hot path.
				}
			}
			s.mu.RUnlock()
		}

		if err != nil {
			// PTY closed (EOF) or error — exit the loop.
			return
		}
	}
}

// Write sends data to the PTY input (stdin of the shell process).
func (s *Session) Write(data []byte) error {
	if s.PTY == nil {
		return fmt.Errorf("terminal/session: pty is nil for session %s", s.ID)
	}
	_, err := s.PTY.Write(data)
	return err
}

// Resize updates the PTY window size.
func (s *Session) Resize(cols, rows uint16) error {
	s.mu.Lock()
	s.Cols = cols
	s.Rows = rows
	s.mu.Unlock()

	return pty.Setsize(s.PTY, &pty.Winsize{
		Cols: cols,
		Rows: rows,
	})
}

// Subscribe registers a new output listener and returns a receive-only
// channel. The channel is buffered (256) to tolerate short consumer stalls.
func (s *Session) Subscribe(id string) <-chan []byte {
	ch := make(chan []byte, listenerBufSize)
	s.mu.Lock()
	s.listeners[id] = ch
	s.mu.Unlock()
	return ch
}

// Unsubscribe removes a listener and closes its channel.
func (s *Session) Unsubscribe(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if ch, ok := s.listeners[id]; ok {
		close(ch)
		delete(s.listeners, id)
	}
}

// Close gracefully terminates the session: sends SIGHUP to the shell,
// closes the PTY fd, and cancels the context.
func (s *Session) Close() {
	// Signal the shell process.
	if s.Cmd != nil && s.Cmd.Process != nil {
		_ = s.Cmd.Process.Signal(syscall.SIGHUP)
	}

	// Close PTY fd — this also causes the readLoop to exit on next Read.
	if s.PTY != nil {
		_ = s.PTY.Close()
	}

	// Cancel context to unblock any select on s.Ctx.Done().
	if s.Cancel != nil {
		s.Cancel()
	}

	// Wait for the process to exit to avoid zombies.
	if s.Cmd != nil {
		_ = s.Cmd.Wait()
	}
}

// Info returns a read-only metadata snapshot.
func (s *Session) Info() SessionInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	pid := 0
	if s.Cmd != nil && s.Cmd.Process != nil {
		pid = s.Cmd.Process.Pid
	}

	return SessionInfo{
		ID:           s.ID,
		CWD:          s.CWD,
		Shell:        s.Shell,
		Cols:         s.Cols,
		Rows:         s.Rows,
		CreatedAt:    s.CreatedAt,
		LastActiveAt: s.LastActiveAt,
		PID:          pid,
	}
}
