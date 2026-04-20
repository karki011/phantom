// Run with: go test -race -v ./internal/terminal/...
// Author: Subash Karki
//
//go:build !windows

package terminal

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
)

// newTestManager creates a Manager and registers cleanup to destroy all
// sessions when the test finishes.
func newTestManager(t *testing.T) *Manager {
	t.Helper()
	m := New()
	t.Cleanup(func() {
		m.DestroyAll()
	})
	return m
}

// createTestSession is a helper that creates a session in the manager using
// a temporary directory as CWD.
func createTestSession(t *testing.T, m *Manager, id string) {
	t.Helper()
	cwd := t.TempDir()
	_, err := m.Create(context.Background(), id, cwd, 80, 24)
	if err != nil {
		t.Fatalf("Create(%q) error: %v", id, err)
	}
}

// ---------------------------------------------------------------------------
// Create / Get / Count
// ---------------------------------------------------------------------------

func TestManager_Create(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	createTestSession(t, m, "pane-1")

	if m.Count() != 1 {
		t.Fatalf("Count() = %d, want 1", m.Count())
	}

	list := m.List()
	if len(list) != 1 {
		t.Fatalf("List() len = %d, want 1", len(list))
	}
	if list[0].ID != "pane-1" {
		t.Fatalf("List()[0].ID = %q, want %q", list[0].ID, "pane-1")
	}
}

func TestManager_CreateDuplicate(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	createTestSession(t, m, "dup-id")

	cwd := t.TempDir()
	_, err := m.Create(context.Background(), "dup-id", cwd, 80, 24)
	if err == nil {
		t.Fatal("expected error creating duplicate session ID")
	}
	if !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestManager_Get(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	createTestSession(t, m, "get-me")

	sess, ok := m.Get("get-me")
	if !ok || sess == nil {
		t.Fatal("Get(existing) returned false")
	}
	if sess.ID != "get-me" {
		t.Fatalf("Get returned session with ID %q, want %q", sess.ID, "get-me")
	}

	_, ok = m.Get("no-such-id")
	if ok {
		t.Fatal("Get(non-existent) returned true")
	}
}

// ---------------------------------------------------------------------------
// Write / Resize
// ---------------------------------------------------------------------------

func TestManager_Write(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	createTestSession(t, m, "write-target")

	err := m.Write("write-target", []byte("echo hi\n"))
	if err != nil {
		t.Fatalf("Write error: %v", err)
	}
}

func TestManager_WriteUnknown(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	err := m.Write("ghost", []byte("hello"))
	if err == nil {
		t.Fatal("expected error writing to non-existent session")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestManager_Resize(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	createTestSession(t, m, "resize-target")

	err := m.Resize("resize-target", 120, 40)
	if err != nil {
		t.Fatalf("Resize error: %v", err)
	}
}

func TestManager_ResizeUnknown(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	err := m.Resize("ghost", 80, 24)
	if err == nil {
		t.Fatal("expected error resizing non-existent session")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Fatalf("unexpected error: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Destroy
// ---------------------------------------------------------------------------

func TestManager_Destroy(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	createTestSession(t, m, "destroy-me")

	err := m.Destroy("destroy-me")
	if err != nil {
		t.Fatalf("Destroy error: %v", err)
	}
	if m.Count() != 0 {
		t.Fatalf("Count() after destroy = %d, want 0", m.Count())
	}

	_, ok := m.Get("destroy-me")
	if ok {
		t.Fatal("Get after Destroy still returns session")
	}
}

func TestManager_DestroyUnknown(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	err := m.Destroy("nope")
	if err == nil {
		t.Fatal("expected error destroying non-existent session")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestManager_DestroyAll(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	for i := 0; i < 3; i++ {
		createTestSession(t, m, fmt.Sprintf("da-%d", i))
	}

	if m.Count() != 3 {
		t.Fatalf("Count() before DestroyAll = %d, want 3", m.Count())
	}

	m.DestroyAll()

	if m.Count() != 0 {
		t.Fatalf("Count() after DestroyAll = %d, want 0", m.Count())
	}
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

func TestManager_List(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	ids := []string{"list-a", "list-b", "list-c"}
	for _, id := range ids {
		createTestSession(t, m, id)
	}

	list := m.List()
	if len(list) != 3 {
		t.Fatalf("List() len = %d, want 3", len(list))
	}

	found := make(map[string]bool)
	for _, info := range list {
		found[info.ID] = true
	}
	for _, id := range ids {
		if !found[id] {
			t.Fatalf("List() missing ID %q", id)
		}
	}
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

func TestManager_ConcurrentCreate(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	const n = 10
	var wg sync.WaitGroup
	errs := make(chan error, n)

	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			id := fmt.Sprintf("cc-%d", idx)
			cwd := t.TempDir()
			_, err := m.Create(context.Background(), id, cwd, 80, 24)
			if err != nil {
				errs <- fmt.Errorf("Create(%q): %w", id, err)
			}
		}(i)
	}

	wg.Wait()
	close(errs)

	for err := range errs {
		t.Errorf("concurrent create error: %v", err)
	}

	if m.Count() != n {
		t.Fatalf("Count() = %d, want %d", m.Count(), n)
	}
}

func TestManager_ConcurrentCreateDestroy(t *testing.T) {
	t.Parallel()

	m := newTestManager(t)
	const n = 10
	var wg sync.WaitGroup

	// Create all sessions first.
	for i := 0; i < n; i++ {
		createTestSession(t, m, fmt.Sprintf("ccd-%d", i))
	}

	// Concurrently destroy half and create new ones.
	for i := 0; i < n; i++ {
		wg.Add(1)
		if i%2 == 0 {
			go func(idx int) {
				defer wg.Done()
				_ = m.Destroy(fmt.Sprintf("ccd-%d", idx))
			}(i)
		} else {
			go func(idx int) {
				defer wg.Done()
				cwd := t.TempDir()
				m.Create(context.Background(), fmt.Sprintf("ccd-new-%d", idx), cwd, 80, 24)
			}(i)
		}
	}

	wg.Wait()

	// No assertion on count — just verifying no race/panic.
	_ = m.Count()
	_ = m.List()
}
