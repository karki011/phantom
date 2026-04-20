// Run with: go test -race -v ./internal/terminal/...
// Author: Subash Karki
//
//go:build !windows

package terminal

import (
	"bytes"
	"io"
	"sync"
	"testing"
)

// ---------------------------------------------------------------------------
// Basic read/write
// ---------------------------------------------------------------------------

func TestRingBuffer_WriteAndRead(t *testing.T) {
	t.Parallel()

	rb := NewRingBuffer(64)
	data := []byte("hello world")

	n, err := rb.Write(data)
	if err != nil {
		t.Fatalf("Write returned error: %v", err)
	}
	if n != len(data) {
		t.Fatalf("Write returned %d, want %d", n, len(data))
	}

	got := rb.Bytes()
	if !bytes.Equal(got, data) {
		t.Fatalf("Bytes() = %q, want %q", got, data)
	}
}

func TestRingBuffer_ExactFill(t *testing.T) {
	t.Parallel()

	const size = 32
	rb := NewRingBuffer(size)
	data := bytes.Repeat([]byte("A"), size)

	n, err := rb.Write(data)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	if n != size {
		t.Fatalf("Write returned %d, want %d", n, size)
	}

	got := rb.Bytes()
	if !bytes.Equal(got, data) {
		t.Fatalf("Bytes() len=%d, want %d; content mismatch", len(got), size)
	}
}

func TestRingBuffer_Wrap(t *testing.T) {
	t.Parallel()

	const size = 16
	rb := NewRingBuffer(size)

	// Write more than buffer size so it wraps.
	data := make([]byte, size+8) // 24 bytes total
	for i := range data {
		data[i] = byte(i)
	}
	rb.Write(data)

	got := rb.Bytes()
	// Only the last 16 bytes should remain.
	want := data[len(data)-size:]
	if !bytes.Equal(got, want) {
		t.Fatalf("Bytes() = %v, want %v (last %d bytes)", got, want, size)
	}
}

func TestRingBuffer_MultipleWraps(t *testing.T) {
	t.Parallel()

	const size = 16
	rb := NewRingBuffer(size)

	// Write 5x buffer size in 5 chunks.
	var allData []byte
	for i := 0; i < 5; i++ {
		chunk := bytes.Repeat([]byte{byte('A' + i)}, size)
		rb.Write(chunk)
		allData = append(allData, chunk...)
	}

	got := rb.Bytes()
	want := allData[len(allData)-size:]
	if !bytes.Equal(got, want) {
		t.Fatalf("Bytes() = %q, want %q", got, want)
	}
}

func TestRingBuffer_LargerThanBuffer(t *testing.T) {
	t.Parallel()

	const size = 16
	rb := NewRingBuffer(size)

	// Single write 3x the buffer size.
	data := make([]byte, size*3)
	for i := range data {
		data[i] = byte(i % 256)
	}

	n, err := rb.Write(data)
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
	if n != len(data) {
		t.Fatalf("Write returned %d, want %d", n, len(data))
	}

	got := rb.Bytes()
	want := data[len(data)-size:]
	if !bytes.Equal(got, want) {
		t.Fatalf("Bytes() = %v, want %v", got, want)
	}
}

func TestRingBuffer_SequentialSmallWrites(t *testing.T) {
	t.Parallel()

	const size = 10
	rb := NewRingBuffer(size)

	// Write 20 single-byte writes so it wraps twice.
	var allData []byte
	for i := 0; i < 20; i++ {
		b := []byte{byte(i)}
		rb.Write(b)
		allData = append(allData, b...)
	}

	got := rb.Bytes()
	want := allData[len(allData)-size:]
	if !bytes.Equal(got, want) {
		t.Fatalf("Bytes() = %v, want %v", got, want)
	}
}

func TestRingBuffer_EmptyBuffer(t *testing.T) {
	t.Parallel()

	rb := NewRingBuffer(64)
	got := rb.Bytes()

	if got == nil {
		// Bytes() may return nil or empty slice — but len must be 0.
	}
	if len(got) != 0 {
		t.Fatalf("Bytes() on fresh buffer has len=%d, want 0", len(got))
	}
}

func TestRingBuffer_Len(t *testing.T) {
	t.Parallel()

	const size = 16
	rb := NewRingBuffer(size)

	// Before any writes.
	if rb.Len() != 0 {
		t.Fatalf("Len() = %d, want 0", rb.Len())
	}

	// After partial fill.
	rb.Write([]byte("hello")) // 5 bytes
	if rb.Len() != 5 {
		t.Fatalf("Len() = %d, want 5", rb.Len())
	}

	// At exact capacity.
	rb.Write(bytes.Repeat([]byte("x"), size-5))
	if rb.Len() != size {
		t.Fatalf("Len() = %d, want %d", rb.Len(), size)
	}

	// After wrap — should stay at size.
	rb.Write([]byte("overflow"))
	if rb.Len() != size {
		t.Fatalf("Len() after wrap = %d, want %d", rb.Len(), size)
	}
}

func TestRingBuffer_Reset(t *testing.T) {
	t.Parallel()

	rb := NewRingBuffer(64)
	rb.Write([]byte("some data"))

	rb.Reset()

	if rb.Len() != 0 {
		t.Fatalf("Len() after Reset = %d, want 0", rb.Len())
	}
	got := rb.Bytes()
	if len(got) != 0 {
		t.Fatalf("Bytes() after Reset has len=%d, want 0", len(got))
	}
}

func TestRingBuffer_ZeroWrite(t *testing.T) {
	t.Parallel()

	rb := NewRingBuffer(64)

	// Write nil.
	n, err := rb.Write(nil)
	if n != 0 || err != nil {
		t.Fatalf("Write(nil) = (%d, %v), want (0, nil)", n, err)
	}

	// Write empty slice.
	n, err = rb.Write([]byte{})
	if n != 0 || err != nil {
		t.Fatalf("Write([]byte{}) = (%d, %v), want (0, nil)", n, err)
	}

	if rb.Len() != 0 {
		t.Fatalf("Len() = %d after zero writes, want 0", rb.Len())
	}
}

func TestRingBuffer_IOWriter(t *testing.T) {
	t.Parallel()

	// Compile-time check that *RingBuffer satisfies io.Writer.
	var _ io.Writer = (*RingBuffer)(nil)
}

func TestRingBuffer_BytesCopy(t *testing.T) {
	t.Parallel()

	rb := NewRingBuffer(64)
	rb.Write([]byte("original"))

	got := rb.Bytes()
	// Mutate the returned slice.
	for i := range got {
		got[i] = 'X'
	}

	// Verify buffer is unchanged.
	after := rb.Bytes()
	if !bytes.Equal(after, []byte("original")) {
		t.Fatalf("Bytes() mutation leaked into buffer: got %q, want %q", after, "original")
	}
}

func TestRingBuffer_DefaultSize(t *testing.T) {
	t.Parallel()

	// size=0 should use 64KB default.
	rb0 := NewRingBuffer(0)
	data := bytes.Repeat([]byte("A"), defaultScrollbackSize)
	rb0.Write(data)
	if rb0.Len() != defaultScrollbackSize {
		t.Fatalf("NewRingBuffer(0): Len() = %d, want %d", rb0.Len(), defaultScrollbackSize)
	}

	// size=-1 should also use 64KB default.
	rbNeg := NewRingBuffer(-1)
	rbNeg.Write(data)
	if rbNeg.Len() != defaultScrollbackSize {
		t.Fatalf("NewRingBuffer(-1): Len() = %d, want %d", rbNeg.Len(), defaultScrollbackSize)
	}
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

func TestRingBuffer_ConcurrentWrites(t *testing.T) {
	t.Parallel()

	rb := NewRingBuffer(1024)
	var wg sync.WaitGroup
	const goroutines = 10
	const writesPerGoroutine = 100

	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for i := 0; i < writesPerGoroutine; i++ {
				data := []byte{byte(id), byte(i)}
				rb.Write(data)
			}
		}(g)
	}

	wg.Wait()

	// Just verify we can read without panic; exact content depends on
	// scheduling but Len() must be <= size.
	if rb.Len() > 1024 {
		t.Fatalf("Len() = %d, exceeds buffer size 1024", rb.Len())
	}
	_ = rb.Bytes() // must not panic
}

func TestRingBuffer_ConcurrentWriteAndRead(t *testing.T) {
	t.Parallel()

	rb := NewRingBuffer(512)
	var wg sync.WaitGroup

	// Writers.
	for g := 0; g < 5; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 200; i++ {
				rb.Write([]byte("data"))
			}
		}()
	}

	// Readers.
	for g := 0; g < 5; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 200; i++ {
				_ = rb.Bytes()
				_ = rb.Len()
			}
		}()
	}

	wg.Wait()
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

func Benchmark_RingBuffer_Write(b *testing.B) {
	rb := NewRingBuffer(defaultScrollbackSize)
	chunk := bytes.Repeat([]byte("X"), 4096) // 4KB

	b.SetBytes(int64(len(chunk)))
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		rb.Write(chunk)
	}
}

func Benchmark_RingBuffer_Bytes(b *testing.B) {
	rb := NewRingBuffer(defaultScrollbackSize)
	// Fill the buffer so Bytes() does a full copy.
	rb.Write(bytes.Repeat([]byte("X"), defaultScrollbackSize))

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_ = rb.Bytes()
	}
}
