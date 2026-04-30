// Phantom — Async per-session transcript writer.
//
// Subscribes to a Session's PTY output stream and asynchronously writes every
// chunk to a per-session log file. Designed to be NON-BLOCKING on the PTY
// hot path: the writer goroutine drains its own buffered channel and the
// readLoop drops frames before it ever blocks waiting for disk I/O.
//
// Author: Subash Karki
package terminal

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/branding"
)

const (
	transcriptFlushInterval  = 1 * time.Second
	transcriptListenerPrefix = "transcript-"
	transcriptFileMode       = 0o600
	transcriptDirMode        = 0o755
)

// TranscriptDir returns the absolute path to the per-user transcript log
// directory: $HOME/<ConfigDirName>/transcripts. Caller is responsible for
// ensuring the directory exists (AttachTranscript creates it on demand).
func TranscriptDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, branding.ConfigDirName, "transcripts"), nil
}

// AttachTranscript spawns a background writer that mirrors every PTY output
// chunk into <logDir>/<sessionID>-<UTCstamp>.log. Returns immediately after
// opening the file and spawning the goroutine.
//
// Non-blocking guarantees:
//   - The PTY readLoop fan-out uses select-default-drop on listener
//     channels, so a slow disk can only cause transcript gaps, never
//     stall the terminal or UI.
//   - The writer goroutine exits cleanly when the listener channel closes
//     (which happens automatically when readLoop ends on session destroy).
//
// File contents are raw bytes (ANSI sequences intact) so the log can be
// replayed verbatim into another xterm via terminal.write(file).
func (s *Session) AttachTranscript(ctx context.Context, logDir string) error {
	if err := os.MkdirAll(logDir, transcriptDirMode); err != nil {
		return fmt.Errorf("transcript: mkdir %s: %w", logDir, err)
	}

	stamp := time.Now().UTC().Format("20060102T150405Z")
	path := filepath.Join(logDir, fmt.Sprintf("%s-%s.log", s.ID, stamp))
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, transcriptFileMode)
	if err != nil {
		return fmt.Errorf("transcript: open %s: %w", path, err)
	}

	listenerID := transcriptListenerPrefix + s.ID
	ch := s.Subscribe(listenerID)

	go runTranscriptWriter(ctx, s.ID, path, f, ch)
	slog.Info("transcript: attached", "session_id", s.ID, "path", path)
	return nil
}

// runTranscriptWriter drains the subscriber channel into a buffered file
// writer. Flushes every transcriptFlushInterval and on exit. Exits when:
//   - the subscriber channel closes (session destroyed → readLoop closed it)
//   - the supplied context is cancelled (app shutdown)
func runTranscriptWriter(ctx context.Context, sessionID, path string, f *os.File, ch <-chan []byte) {
	bw := bufio.NewWriter(f)
	ticker := time.NewTicker(transcriptFlushInterval)
	defer func() {
		ticker.Stop()
		if err := bw.Flush(); err != nil {
			slog.Warn("transcript: final flush", "session_id", sessionID, "err", err)
		}
		if err := f.Close(); err != nil {
			slog.Warn("transcript: close", "session_id", sessionID, "err", err)
		}
		slog.Info("transcript: detached", "session_id", sessionID, "path", path)
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case data, ok := <-ch:
			if !ok {
				return
			}
			if _, err := bw.Write(data); err != nil {
				slog.Warn("transcript: write", "session_id", sessionID, "err", err)
				return
			}
		case <-ticker.C:
			if err := bw.Flush(); err != nil {
				slog.Warn("transcript: tick flush", "session_id", sessionID, "err", err)
			}
		}
	}
}
