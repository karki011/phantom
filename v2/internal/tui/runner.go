// Author: Subash Karki
// Package tui provides Bubbletea TUI programs that run inside PTY sessions
// managed by the terminal manager. Programs are wired directly to a pty/tty
// pair so xterm.js in the frontend can render them via Wails events.
package tui

import (
	"context"
	"fmt"
	"os"
	"sync"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/creack/pty"
)

// Program is the type constraint for Bubbletea models accepted by RunInPTY.
type Program interface {
	tea.Model
}

// Session holds the PTY master fd and the running Bubbletea program. Callers
// own both and must call Close when done.
type Session struct {
	// PTY is the master side of the pty pair. Write user input here; read
	// rendered output from here and forward to xterm.js.
	PTY *os.File

	// tty is the slave side. Owned by the Bubbletea program; closed after Run returns.
	tty *os.File

	// program is the running Bubbletea instance.
	program *tea.Program

	// done is closed when the program exits.
	done chan struct{}

	// err captures the program's exit error (if any).
	err error

	// closeOnce ensures Close is idempotent.
	closeOnce sync.Once
}

// RunInPTY creates a pty/tty pair, wires the given Bubbletea model to the tty,
// and starts the program in a background goroutine. It returns a *Session whose
// PTY field is the master fd the caller should pump output from.
//
// The caller is responsible for:
//  1. Reading output from Session.PTY and forwarding it to the terminal manager
//     (or Wails events).
//  2. Writing user input to Session.PTY.
//  3. Calling Session.Close when done.
func RunInPTY(ctx context.Context, model tea.Model, cols, rows uint16) (*Session, error) {
	ptmx, tty, err := pty.Open()
	if err != nil {
		return nil, fmt.Errorf("tui/runner: pty.Open: %w", err)
	}

	if err := pty.Setsize(ptmx, &pty.Winsize{Cols: cols, Rows: rows}); err != nil {
		_ = ptmx.Close()
		_ = tty.Close()
		return nil, fmt.Errorf("tui/runner: pty.Setsize: %w", err)
	}

	prog := tea.NewProgram(
		model,
		tea.WithInput(tty),
		tea.WithOutput(tty),
	)

	sess := &Session{
		PTY:     ptmx,
		tty:     tty,
		program: prog,
		done:    make(chan struct{}),
	}

	go func() {
		defer close(sess.done)
		defer tty.Close()

		// Run blocks until the program exits or context is cancelled.
		_, runErr := prog.Run()
		if runErr != nil {
			sess.err = fmt.Errorf("tui/runner: program.Run: %w", runErr)
		}
	}()

	// Respect context cancellation — quit the program when context is done.
	go func() {
		select {
		case <-ctx.Done():
			prog.Quit()
		case <-sess.done:
		}
	}()

	return sess, nil
}

// Resize updates the PTY window size and forwards it to the Bubbletea program.
func (s *Session) Resize(cols, rows uint16) error {
	return pty.Setsize(s.PTY, &pty.Winsize{Cols: cols, Rows: rows})
}

// Wait blocks until the program exits and returns any error.
func (s *Session) Wait() error {
	<-s.done
	return s.err
}

// Close terminates the program and closes both PTY fds. Safe to call multiple
// times; subsequent calls are no-ops. Waits up to 3 seconds for the program
// to exit before closing the PTY fd to avoid deadlock on stuck programs.
func (s *Session) Close() {
	s.closeOnce.Do(func() {
		s.program.Quit()
		select {
		case <-s.done:
		case <-time.After(3 * time.Second):
		}
		_ = s.PTY.Close()
		_ = s.tty.Close()
	})
}
