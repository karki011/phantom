// pause_test.go tests PauseBuffer output buffering behaviour.
// Author: Subash Karki
package session

import (
	"bytes"
	"sync"
	"testing"
)

func TestPauseBuffer_NotPaused(t *testing.T) {
	pb := NewPauseBuffer()
	if pb.Write([]byte("hello")) {
		t.Fatal("Write should return false when not paused")
	}
	if pb.BufferSize() != 0 {
		t.Fatal("buffer size should be 0 when not paused")
	}
}

func TestPauseBuffer_Paused(t *testing.T) {
	pb := NewPauseBuffer()
	pb.Pause()

	data := []byte("buffered data")
	if !pb.Write(data) {
		t.Fatal("Write should return true when paused")
	}
	if pb.BufferSize() != len(data) {
		t.Fatalf("expected buffer size %d, got %d", len(data), pb.BufferSize())
	}
	if !pb.IsPaused() {
		t.Fatal("IsPaused should return true after Pause()")
	}
}

func TestPauseBuffer_Resume(t *testing.T) {
	pb := NewPauseBuffer()
	pb.Pause()

	chunks := [][]byte{
		[]byte("chunk-1"),
		[]byte("chunk-2"),
		[]byte("chunk-3"),
	}
	for _, c := range chunks {
		pb.Write(c)
	}

	var received [][]byte
	pb.Resume(func(data []byte) {
		cp := make([]byte, len(data))
		copy(cp, data)
		received = append(received, cp)
	})

	if pb.IsPaused() {
		t.Fatal("IsPaused should be false after Resume()")
	}
	if pb.BufferSize() != 0 {
		t.Fatal("buffer should be empty after Resume()")
	}
	if len(received) != len(chunks) {
		t.Fatalf("expected %d chunks flushed, got %d", len(chunks), len(received))
	}
	for i, want := range chunks {
		if !bytes.Equal(received[i], want) {
			t.Errorf("chunk %d: got %q want %q", i, received[i], want)
		}
	}
}

func TestPauseBuffer_ResumeEmpty(t *testing.T) {
	pb := NewPauseBuffer()
	pb.Pause()

	called := false
	pb.Resume(func([]byte) { called = true })

	if called {
		t.Fatal("writer should not be called when there is no buffered data")
	}
	if pb.IsPaused() {
		t.Fatal("IsPaused should be false after Resume()")
	}
}

func TestPauseBuffer_ConcurrentWrites(t *testing.T) {
	pb := NewPauseBuffer()
	pb.Pause()

	const goroutines = 50
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			pb.Write([]byte("data"))
		}()
	}
	wg.Wait()

	// All writes must have been buffered.
	if pb.BufferSize() != goroutines*len("data") {
		t.Fatalf("expected %d buffered bytes, got %d", goroutines*len("data"), pb.BufferSize())
	}
}
