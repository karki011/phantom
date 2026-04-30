// Package terminal manages real PTY sessions for Phantom terminal panes.
// Author: Subash Karki
package terminal

import "sync"

const defaultScrollbackSize = 65536 // 64KB — matches v1 SCROLLBACK_MAX

// RingBuffer is a fixed-size, thread-safe, circular byte buffer used for
// terminal scrollback. It implements io.Writer so PTY output can be tee'd
// directly into it.
type RingBuffer struct {
	mu      sync.Mutex
	buf     []byte
	size    int
	pos     int // next write position
	written int // total bytes written (capped at size to detect full)
}

// NewRingBuffer creates a ring buffer with the given capacity in bytes.
// If size <= 0, defaultScrollbackSize (64KB) is used.
func NewRingBuffer(size int) *RingBuffer {
	if size <= 0 {
		size = defaultScrollbackSize
	}
	return &RingBuffer{
		buf:  make([]byte, size),
		size: size,
	}
}

// Write appends p to the ring buffer, wrapping around when full.
// It always succeeds and returns len(p), nil — matching io.Writer semantics.
func (rb *RingBuffer) Write(p []byte) (n int, err error) {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	n = len(p)
	if n == 0 {
		return 0, nil
	}

	// If incoming data is larger than the entire buffer, only keep the tail.
	if n >= rb.size {
		copy(rb.buf, p[n-rb.size:])
		rb.pos = 0
		rb.written = rb.size
		return n, nil
	}

	// How much fits before wrapping?
	space := rb.size - rb.pos
	if n <= space {
		copy(rb.buf[rb.pos:], p)
	} else {
		copy(rb.buf[rb.pos:], p[:space])
		copy(rb.buf, p[space:])
	}

	rb.pos = (rb.pos + n) % rb.size

	rb.written += n
	if rb.written > rb.size {
		rb.written = rb.size
	}

	return n, nil
}

// Bytes returns the buffered content in chronological order. The returned
// slice is a copy — callers may mutate it freely.
func (rb *RingBuffer) Bytes() []byte {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	if rb.written < rb.size {
		// Buffer hasn't wrapped yet — data is [0, pos).
		out := make([]byte, rb.pos)
		copy(out, rb.buf[:rb.pos])
		return out
	}

	// Buffer is full and has wrapped. Oldest data starts at rb.pos.
	out := make([]byte, rb.size)
	tail := rb.size - rb.pos
	copy(out, rb.buf[rb.pos:])
	copy(out[tail:], rb.buf[:rb.pos])
	return out
}

// Len returns the number of bytes currently stored.
func (rb *RingBuffer) Len() int {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	return rb.written
}

// Reset clears the buffer.
func (rb *RingBuffer) Reset() {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	rb.pos = 0
	rb.written = 0
}
