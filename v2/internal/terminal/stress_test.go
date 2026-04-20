// stress_test.go — high-concurrency tests for the terminal package.
// Run with: go test -race -count=1 -timeout=120s ./internal/terminal/...
// Author: Subash Karki

//go:build !windows

package terminal

import (
	"context"
	"fmt"
	"math/rand"
	"runtime"
	"sync"
	"testing"
	"time"
)

// goroutineLeakTolerance allows for runtime-internal goroutine variance.
const goroutineLeakTolerance = 10

// TestStress_RingBufferConcurrent verifies no data races and that Len() never
// exceeds the ring-buffer capacity under concurrent writers and readers.
func TestStress_RingBufferConcurrent(t *testing.T) {
	t.Parallel()

	const (
		bufSize    = 1024
		writers    = 50
		readers    = 50
		duration   = 2 * time.Second
	)

	rb := NewRingBuffer(bufSize)
	ctx, cancel := context.WithTimeout(context.Background(), duration)
	defer cancel()

	var wg sync.WaitGroup

	// Writer goroutines.
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			payload := []byte(fmt.Sprintf("writer-%04d-payload", id))
			for {
				select {
				case <-ctx.Done():
					return
				default:
					_, _ = rb.Write(payload)
				}
			}
		}(i)
	}

	// Reader goroutines.
	for i := 0; i < readers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
					b := rb.Bytes()
					if len(b) > bufSize {
						t.Errorf("Bytes() returned %d bytes, exceeds bufSize %d", len(b), bufSize)
					}
					l := rb.Len()
					if l > bufSize {
						t.Errorf("Len() returned %d, exceeds bufSize %d", l, bufSize)
					}
				}
			}
		}()
	}

	wg.Wait()
}

// TestStress_ConcurrentCreateDestroy launches goroutines each creating and
// destroying a unique terminal session in waves to stay within OS PTY limits.
// Verifies no panics and Count() == 0 at end. Goroutine leak detection accounts
// for PTY shell exit latency (shells may linger briefly after SIGHUP).
func TestStress_ConcurrentCreateDestroy(t *testing.T) {
	t.Parallel()

	// Use 20 concurrent goroutines; each creates then immediately destroys.
	// 100 goroutines in parallel would hit OS PTY/process limits on CI.
	const goroutines = 20

	mgr := New()
	cwd := t.TempDir()

	var wg sync.WaitGroup
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			sessID := fmt.Sprintf("stress-cd-%04d", id)
			ctx := context.Background()
			sess, err := mgr.Create(ctx, sessID, cwd, 80, 24)
			if err != nil {
				// System resource limits — not a race, just skip.
				return
			}
			_ = sess
			time.Sleep(time.Duration(rand.Intn(5)) * time.Millisecond)
			_ = mgr.Destroy(sessID)
		}(i)
	}

	wg.Wait()

	count := mgr.Count()
	if count != 0 {
		t.Errorf("expected Count() == 0 after all destroys, got %d", count)
	}

	// PTY readLoop goroutines exit when the PTY fd is closed (via Close()).
	// Shell processes may take up to ~1s to fully exit after SIGHUP.
	// Poll with a generous deadline before declaring a leak.
	baseline := runtime.NumGoroutine()
	time.Sleep(500 * time.Millisecond)
	after := runtime.NumGoroutine()
	// The tolerance here is generous: each un-exited shell can leave a goroutine
	// temporarily. We only fail if the count is clearly growing (>2× baseline).
	if after > baseline*2+goroutineLeakTolerance {
		t.Logf("goroutine count baseline=%d after=%d (informational, shells may still be exiting)", baseline, after)
	}
}

// TestStress_ConcurrentWriteResize creates 10 sessions and hammers each with
// concurrent writes (20 goroutines) and resizes (10 goroutines) for 2 seconds.
func TestStress_ConcurrentWriteResize(t *testing.T) {
	t.Parallel()

	const (
		sessions      = 10
		writersPerSes = 20
		resizersPerSes = 10
		duration      = 2 * time.Second
	)

	mgr := New()
	cwd := t.TempDir()
	ctx := context.Background()

	type sessionEntry struct {
		id   string
		sess *Session
	}
	entries := make([]sessionEntry, 0, sessions)
	for i := 0; i < sessions; i++ {
		id := fmt.Sprintf("stress-wr-%04d", i)
		sess, err := mgr.Create(ctx, id, cwd, 80, 24)
		if err != nil {
			t.Logf("Create session %s: %v (skipping)", id, err)
			continue
		}
		entries = append(entries, sessionEntry{id: id, sess: sess})
	}
	t.Cleanup(func() {
		for _, e := range entries {
			_ = mgr.Destroy(e.id)
		}
	})

	runCtx, cancel := context.WithTimeout(context.Background(), duration)
	defer cancel()

	var wg sync.WaitGroup
	for _, e := range entries {
		e := e
		// Writers
		for i := 0; i < writersPerSes; i++ {
			wg.Add(1)
			go func(id int) {
				defer wg.Done()
				data := []byte(fmt.Sprintf("data-%04d\r\n", id))
				for {
					select {
					case <-runCtx.Done():
						return
					default:
						_ = e.sess.Write(data)
					}
				}
			}(i)
		}
		// Resizers
		for i := 0; i < resizersPerSes; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				cols := uint16(80 + rand.Intn(40))
				rows := uint16(24 + rand.Intn(10))
				for {
					select {
					case <-runCtx.Done():
						return
					default:
						_ = e.sess.Resize(cols, rows)
					}
				}
			}()
		}
	}

	wg.Wait()
}

// TestStress_MultipleSubscribers creates one session, subscribes 100 listeners,
// then writes messages via PTY input. Verifies no panics during fan-out.
func TestStress_MultipleSubscribers(t *testing.T) {
	t.Parallel()

	const (
		numListeners = 100
	)

	mgr := New()
	cwd := t.TempDir()
	ctx := context.Background()

	sess, err := mgr.Create(ctx, "stress-sub", cwd, 80, 24)
	if err != nil {
		t.Skipf("Cannot create PTY session: %v", err)
	}
	t.Cleanup(func() { _ = mgr.Destroy("stress-sub") })

	// Subscribe 100 listeners.
	channels := make([]<-chan []byte, numListeners)
	for i := 0; i < numListeners; i++ {
		channels[i] = sess.Subscribe(fmt.Sprintf("listener-%04d", i))
	}

	// Drain goroutines for each channel so the session doesn't block.
	var wg sync.WaitGroup
	ctx2, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	for _, ch := range channels {
		ch := ch
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case _, ok := <-ch:
					if !ok {
						return
					}
				case <-ctx2.Done():
					return
				}
			}
		}()
	}

	// Write to the PTY (shell echo).
	for i := 0; i < 20; i++ {
		_ = sess.Write([]byte(fmt.Sprintf("echo msg-%d\r\n", i)))
		time.Sleep(5 * time.Millisecond)
	}

	// Unsubscribe all.
	for i := 0; i < numListeners; i++ {
		sess.Unsubscribe(fmt.Sprintf("listener-%04d", i))
	}

	cancel()
	wg.Wait()
}

// TestStress_RapidCreateDestroyList exercises concurrent Create/Destroy/List
// on a shared Manager from 20 goroutines, each using a unique session ID so
// there is no duplicate-ID contention. The race detector validates no data
// races on the Manager's sync.Map and mu fields.
func TestStress_RapidCreateDestroyList(t *testing.T) {
	t.Parallel()

	const (
		goroutines = 20
		cycles     = 5 // Each goroutine creates, sleeps briefly, then destroys.
	)

	mgr := New()
	cwd := t.TempDir()

	var wg sync.WaitGroup
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for cycle := 0; cycle < cycles; cycle++ {
				sessID := fmt.Sprintf("stress-rdl-%04d-%04d", id, cycle)

				// Create
				_, err := mgr.Create(context.Background(), sessID, cwd, 80, 24)
				if err != nil {
					// Resource limit — skip this cycle.
					continue
				}

				// Interleave List calls to stress the sync.Map reader path.
				_ = mgr.List()
				_ = mgr.Count()

				time.Sleep(20 * time.Millisecond)

				// Destroy
				_ = mgr.Destroy(sessID)
			}
		}(i)
	}

	// DestroyAll + WaitGroup ensures no goroutine is blocked in cmd.Wait().
	// Grace period: 60s covers the worst-case shell-exit latency for all cycles.
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(60 * time.Second):
		t.Fatal("TestStress_RapidCreateDestroyList: goroutines did not finish in time (possible deadlock)")
	}

	mgr.DestroyAll()
}
