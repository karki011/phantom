// scanner.go reads a JSONL file and produces Events — supports batch scan,
// partial (offset-based) reads, and live tail via polling.
// Author: Subash Karki
package stream

import (
	"bufio"
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
)

const tailPollInterval = 500 * time.Millisecond    // legacy polling fallback
const tailDebounceInterval = 100 * time.Millisecond // coalesce rapid JSONL appends
const tailFallbackInterval = 5 * time.Second        // safety net when fsnotify active
const scannerBufSize = 64 * 1024                    // 64 KB initial buffer
const scannerMaxSize = 10 * 1024 * 1024             // 10 MB max line length — Claude lines can include thinking signatures, base64 images, large tool outputs

// Scanner reads a JSONL file and produces Events using the embedded Parser.
type Scanner struct {
	parser   *Parser
	filePath string
}

// NewScanner creates a Scanner for the given session and JSONL file path.
func NewScanner(sessionID, filePath string) *Scanner {
	return &Scanner{
		parser:   NewParser(sessionID),
		filePath: filePath,
	}
}

// ScanAll reads the entire JSONL file from the beginning and returns all Events.
func (s *Scanner) ScanAll() ([]Event, error) {
	f, err := os.Open(s.filePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	return s.readEvents(f)
}

// ScanFrom reads from the given byte offset, returns new Events and the
// updated offset to pass on the next call.
func (s *Scanner) ScanFrom(offset int64) ([]Event, int64, error) {
	f, err := os.Open(s.filePath)
	if err != nil {
		return nil, offset, err
	}
	defer f.Close()

	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		return nil, offset, err
	}

	events, err := s.readEvents(f)
	if err != nil {
		return nil, offset, err
	}

	// Determine new offset after reading
	newOffset, err := f.Seek(0, io.SeekCurrent)
	if err != nil {
		// Fallback: re-stat the file
		info, statErr := os.Stat(s.filePath)
		if statErr == nil {
			newOffset = info.Size()
		} else {
			newOffset = offset
		}
	}

	return events, newOffset, nil
}

// Tail watches the file for new lines using fsnotify and sends events to ch
// until ctx is cancelled. Falls back to 500ms polling if fsnotify is unavailable.
func (s *Scanner) Tail(ctx context.Context, ch chan<- Event) error {
	info, err := os.Stat(s.filePath)
	if err != nil {
		slog.Warn("stream/scanner: tail stat failed, starting from 0", "path", s.filePath, "err", err)
	}

	var offset int64
	if info != nil {
		offset = info.Size()
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		slog.Warn("stream/scanner: fsnotify unavailable, polling", "err", err)
		return s.tailPoll(ctx, ch, offset)
	}
	defer watcher.Close()

	// Watch the parent directory — more reliable than per-file across platforms.
	dir := filepath.Dir(s.filePath)
	base := filepath.Base(s.filePath)
	if err := watcher.Add(dir); err != nil {
		slog.Warn("stream/scanner: watch dir failed, polling", "dir", dir, "err", err)
		return s.tailPoll(ctx, ch, offset)
	}

	var debounceTimer *time.Timer
	debounceCh := make(chan struct{}, 1)
	fallback := time.NewTicker(tailFallbackInterval)
	defer fallback.Stop()

	for {
		select {
		case <-ctx.Done():
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			return ctx.Err()

		case ev, ok := <-watcher.Events:
			if !ok {
				return nil
			}
			if filepath.Base(ev.Name) != base {
				continue
			}
			if !ev.Has(fsnotify.Write) && !ev.Has(fsnotify.Create) {
				continue
			}
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			debounceTimer = time.AfterFunc(tailDebounceInterval, func() {
				select {
				case debounceCh <- struct{}{}:
				default:
				}
			})

		case <-debounceCh:
			offset = s.readAndEmit(ctx, ch, offset)

		case err, ok := <-watcher.Errors:
			if !ok {
				return nil
			}
			slog.Warn("stream/scanner: watcher error", "err", err)

		case <-fallback.C:
			offset = s.readAndEmit(ctx, ch, offset)
		}
	}
}

// readAndEmit reads new events from offset and sends them to ch.
func (s *Scanner) readAndEmit(ctx context.Context, ch chan<- Event, offset int64) int64 {
	events, newOffset, err := s.ScanFrom(offset)
	if err != nil {
		slog.Warn("stream/scanner: tail read failed", "path", s.filePath, "err", err)
		return offset
	}
	for _, ev := range events {
		select {
		case ch <- ev:
		case <-ctx.Done():
			return newOffset
		}
	}
	return newOffset
}

// tailPoll is the legacy fallback when fsnotify is unavailable.
func (s *Scanner) tailPoll(ctx context.Context, ch chan<- Event, offset int64) error {
	ticker := time.NewTicker(tailPollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			offset = s.readAndEmit(ctx, ch, offset)
		}
	}
}

// readEvents uses a bufio.Scanner to read all lines from r and parse each.
func (s *Scanner) readEvents(r io.Reader) ([]Event, error) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, scannerBufSize), scannerMaxSize)

	var events []Event
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		// ParseLineMulti returns all events from a single JSONL line (e.g.
		// assistant messages with multiple content blocks).
		evs := s.parser.ParseLineMulti(line)
		events = append(events, evs...)
	}
	return events, sc.Err()
}
