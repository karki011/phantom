// Author: Subash Karki
package filegraph

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestStartSetsIndexingFlagSynchronously verifies that the indexing flag is
// set before Start() returns, so callers polling IsIndexing() right away
// never observe a false negative from the goroutine not having scheduled yet.
func TestStartSetsIndexingFlagSynchronously(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.go"), []byte("package a\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	ix := NewIndexer(dir)
	if err := ix.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer ix.Stop()

	if !ix.IsIndexing() {
		t.Fatal("IsIndexing() returned false immediately after Start(); expected true")
	}

	deadline := time.Now().Add(2 * time.Second)
	for ix.IsIndexing() && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if ix.IsIndexing() {
		t.Fatal("Indexer still indexing after 2s; expected to finish on tiny project")
	}

	files, _, _ := ix.Graph().Stats()
	if files == 0 {
		t.Fatal("expected at least 1 file indexed")
	}
}
