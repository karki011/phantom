// Package applog holds a bounded in-memory capture of process log output for the UI.
// Author: Subash Karki
package applog

import (
	"bytes"
	"sync"
)

var (
	mu     sync.RWMutex
	global *Ring
)

// Init allocates the global ring (call once from main before other logging).
func Init(maxLines int) {
	if maxLines < 100 {
		maxLines = 100
	}
	if maxLines > 50_000 {
		maxLines = 50_000
	}
	mu.Lock()
	global = NewRing(maxLines)
	mu.Unlock()
}

// Writer returns the global ring as an io.Writer, or io.Discard if Init was not called.
func Writer() syncWriter {
	mu.RLock()
	r := global
	mu.RUnlock()
	if r == nil {
		return nilRing{}
	}
	return r
}

type nilRing struct{}

func (nilRing) Write(p []byte) (int, error) { return len(p), nil }

type syncWriter interface {
	Write(p []byte) (n int, err error)
}

// Ring is a line-oriented ring buffer safe for concurrent Write and Snapshot.
type Ring struct {
	mu       sync.Mutex
	lines    []string
	capacity int
	partial  []byte
}

func NewRing(capacity int) *Ring {
	ic := capacity
	if ic > 1024 {
		ic = 1024
	}
	return &Ring{lines: make([]string, 0, ic), capacity: capacity}
}

// Write implements io.Writer. Incomplete lines are buffered until a newline.
func (r *Ring) Write(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	buf := append(append([]byte{}, r.partial...), p...)
	r.partial = r.partial[:0]
	for len(buf) > 0 {
		idx := bytes.IndexByte(buf, '\n')
		if idx < 0 {
			r.partial = append(r.partial[:0], buf...)
			break
		}
		r.push(string(buf[:idx]))
		buf = buf[idx+1:]
	}
	return len(p), nil
}

func (r *Ring) push(line string) {
	if len(r.lines) >= r.capacity {
		copy(r.lines, r.lines[1:])
		r.lines = r.lines[:len(r.lines)-1]
	}
	r.lines = append(r.lines, line)
}

// Snapshot returns up to last maxLines entries (oldest first).
func Snapshot(maxLines int) []string {
	mu.RLock()
	r := global
	mu.RUnlock()
	if r == nil {
		return nil
	}
	return r.snapshot(maxLines)
}

func (r *Ring) snapshot(maxLines int) []string {
	if maxLines <= 0 {
		maxLines = 500
	}
	if maxLines > 10_000 {
		maxLines = 10_000
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	n := len(r.lines)
	if n == 0 {
		return nil
	}
	if n <= maxLines {
		out := make([]string, n)
		copy(out, r.lines)
		return out
	}
	start := n - maxLines
	out := make([]string, maxLines)
	copy(out, r.lines[start:])
	return out
}
