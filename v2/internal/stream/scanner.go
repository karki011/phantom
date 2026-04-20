// scanner.go reads a JSONL file and produces Events — supports batch scan,
// partial (offset-based) reads, and live tail via polling.
// Author: Subash Karki
package stream

import (
	"bufio"
	"context"
	"io"
	"log"
	"os"
	"time"
)

const tailPollInterval = 500 * time.Millisecond
const scannerBufSize = 64 * 1024        // 64 KB initial buffer
const scannerMaxSize = 10 * 1024 * 1024 // 10 MB max line length — Claude lines can include thinking signatures, base64 images, large tool outputs

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

// Tail watches the file for new lines and sends events to ch until ctx is cancelled.
// It polls the file size every 500ms and reads any new lines when the file grows.
func (s *Scanner) Tail(ctx context.Context, ch chan<- Event) error {
	// Start from current end of file so we only tail new content.
	info, err := os.Stat(s.filePath)
	if err != nil {
		// File may not exist yet — start from zero and retry
		log.Printf("stream/scanner: tail stat %s: %v, starting from 0", s.filePath, err)
	}

	var offset int64
	if info != nil {
		offset = info.Size()
	}

	ticker := time.NewTicker(tailPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			events, newOffset, err := s.ScanFrom(offset)
			if err != nil {
				// File may have been rotated or temporarily unavailable — keep going.
				log.Printf("stream/scanner: tail read error %s: %v", s.filePath, err)
				continue
			}
			offset = newOffset
			for _, ev := range events {
				select {
				case ch <- ev:
				case <-ctx.Done():
					return ctx.Err()
				}
			}
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
