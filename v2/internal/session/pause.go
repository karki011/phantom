// pause.go provides output buffering for paused sessions.
// Author: Subash Karki
package session

import "sync"

// PauseBuffer intercepts terminal output while a session is paused, buffering
// it in memory and flushing to the original writer on resume.
type PauseBuffer struct {
	mu       sync.Mutex
	buffered [][]byte
	paused   bool
}

// NewPauseBuffer creates an unpaused PauseBuffer.
func NewPauseBuffer() *PauseBuffer {
	return &PauseBuffer{}
}

// Pause begins buffering output. Idempotent.
func (pb *PauseBuffer) Pause() {
	pb.mu.Lock()
	pb.paused = true
	pb.mu.Unlock()
}

// Resume flushes buffered output to writer (in order) and stops buffering.
// writer is called once per buffered chunk; it is called under no lock so it
// may safely invoke additional session operations.
func (pb *PauseBuffer) Resume(writer func([]byte)) {
	pb.mu.Lock()
	chunks := pb.buffered
	pb.buffered = nil
	pb.paused = false
	pb.mu.Unlock()

	for _, chunk := range chunks {
		writer(chunk)
	}
}

// IsPaused returns true while buffering is active.
func (pb *PauseBuffer) IsPaused() bool {
	pb.mu.Lock()
	defer pb.mu.Unlock()
	return pb.paused
}

// Write captures data if paused (returns true) or signals the caller to let it
// through by returning false.
func (pb *PauseBuffer) Write(data []byte) bool {
	pb.mu.Lock()
	defer pb.mu.Unlock()
	if !pb.paused {
		return false
	}
	// Copy — caller may reuse the underlying slice.
	cp := make([]byte, len(data))
	copy(cp, data)
	pb.buffered = append(pb.buffered, cp)
	return true
}

// BufferSize returns the total number of buffered bytes.
func (pb *PauseBuffer) BufferSize() int {
	pb.mu.Lock()
	defer pb.mu.Unlock()
	n := 0
	for _, chunk := range pb.buffered {
		n += len(chunk)
	}
	return n
}
